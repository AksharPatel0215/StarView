"""Evidence-first RAG. Source validation is deterministic; entailment checks are model-based."""
import asyncio
import time
import re
import copy
import hashlib
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from app.core.evidence import evidence_passages,locate_quote
from app.core.hybrid_retrieval import hybrid_candidates
from app.core.grounding_model import structured
from app.core.query_paths import query_path,comparison_topics,terms

def object_schema(properties):
    return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
TEXT={'type':'string'}
EVIDENCE=object_schema({'id':TEXT,'quote':{'type':'string','maxLength':1200}})
CLAIM=object_schema({'text':{'type':'string','maxLength':1200},'kind':{'type':'string','enum':['stated','inference']},'evidence':{'type':'array','items':EVIDENCE,'minItems':1,'maxItems':4}})
GENERATION=object_schema({'claims':{'type':'array','items':CLAIM,'maxItems':6}})

async def _rerank_batch(retrieval,query,candidates,model,key,limit=8):
    schema=object_schema({'matches':{'type':'array','items':object_schema({'id':TEXT,'score':{'type':'integer','enum':[3,4]},'quote':TEXT,'reason':TEXT})}})
    schema['properties']['matches']['maxItems']=limit
    schema['properties']['matches']['items']['properties']['id']={'type':'string','enum':[p['id'] for p in candidates]}
    schema['properties']['matches']['items']['properties']['quote']={'type':'string','maxLength':220}
    schema['properties']['matches']['items']['properties']['reason']={'type':'string','maxLength':140}
    data=await structured(model,'Rerank passages by semantic relevance to the question. Select only substantive evidence, not shared vocabulary or navigation links. Score 4 means directly relevant, 3 means necessary supporting evidence. Do not fill a quota. Return zero matches when nothing is relevant. Copy one exact supporting quote for each selected passage.',{'question':query,'candidates':candidates},schema,key,2500)
    known={p['id']:p for p in candidates};matches=data.get('matches',[])
    if not isinstance(matches,list):raise RuntimeError('The evidence reranker returned an invalid result. Retry the query.')
    selected=[];seen=set();per_file={}
    for item in sorted((m for m in matches if isinstance(m,dict)),key=lambda m:m.get('score',0) if type(m.get('score')) is int else 0,reverse=True):
        p=known.get(item.get('id'))
        if not p or item.get('score') not in (3,4) or p['id'] in seen or per_file.get(p['path'],0)>=2:continue
        if not locate_quote(retrieval,p,item.get('quote')):continue
        selected.append({**p,'rerank_score':item['score']});seen.add(p['id']);per_file[p['path']]=per_file.get(p['path'],0)+1
        if len(selected)>=limit:break
    return selected

async def rerank(retrieval,query,candidates,model,key,limit=8):
    matches=[]
    semaphore=asyncio.Semaphore(2)
    async def batch(start):
        async with semaphore:
            return await _rerank_batch(retrieval,query,candidates[start:start+6],model,key,min(6,limit))
    for result in await asyncio.gather(*(batch(start) for start in range(0,len(candidates),6))):
        matches.extend(result)
    matches.sort(key=lambda p:(p['rerank_score'],p.get('retrieval_score',0)),reverse=True)
    selected=[];seen=set();per_file={}
    for p in matches:
        if p['id'] in seen or per_file.get(p['path'],0)>=2:continue
        selected.append(p);seen.add(p['id']);per_file[p['path']]=per_file.get(p['path'],0)+1
        if len(selected)>=limit:break
    return selected

def grounded_claims(retrieval,candidates,claims,full_passages=False):
    known={p['id']:p for p in candidates};result=[]
    if not isinstance(claims,list):return []
    for claim in claims[:6]:
        if not isinstance(claim,dict) or not isinstance(claim.get('text'),str) or not claim['text'].strip() or claim.get('kind') not in ('stated','inference'):continue
        refs=claim.get('evidence')
        if not isinstance(refs,list) or not refs:continue
        citations=[];valid=True
        for reference in refs:
            if not isinstance(reference,dict):valid=False;break
            passage=known.get(reference.get('id'))
            citation=locate_quote(retrieval,passage,reference.get('quote')) if passage else None
            if passage and full_passages and 'quote' not in reference:
                source_lines=retrieval.read(passage['path']).splitlines()
                source='\n'.join(source_lines[passage['line_start']-1:passage['line_end']])
                normalize=lambda value:' '.join(value.split())
                if all(normalize(line) in normalize(source) for line in passage['excerpt'].splitlines() if line.strip()):
                    citation={'passage_id':passage['id'],'path':passage['path'],'line_start':passage['line_start'],'line_end':passage['line_end'],'quote':source}

            if not citation:valid=False;break
            citations.append(citation)
        if valid:result.append({'text':claim['text'].strip(),'kind':claim['kind'],'evidence':citations})
    return result

async def verify_claims(claims,model,key):
    accepted=[]
    system='''Review each mathematical claim independently against ONLY its attached source passages. Return status and a reason of at most 20 words. First compare hypotheses and quantifiers: dropping a condition such as nonzero derivative, adding critical points, or turning a local conclusion into a global claim is UNSUPPORTED. Then check every factual assertion is entailed. A source about angles does not establish the argument principle or Rouche theorem. A root maps to zero; it does not put a complex function graph in the complex plane. A graph link or plausible outside fact is not evidence. A direct restatement or modest logical inference is supported; it need not be word-for-word identical. Any unsupported part makes the whole claim unsupported. For numerical algorithms, check where evaluations occur: bisection evaluates the midpoint, not just endpoints. A formula alone does not establish a convergence rate or guarantee. Every comparison needs substantive evidence for both subjects; a navigation link is insufficient. If unsure choose uncertain. Do not supply new facts.'''
    if not claims:return []
    schema=object_schema({'verdicts':{'type':'array','items':object_schema({'index':{'type':'integer'},'status':{'type':'string','enum':['supported','unsupported','uncertain']},'reason':TEXT})}})
    async def review(items,instruction):
        result=await structured(model,instruction+' Evaluate each indexed claim independently. Return one verdict per index; never transfer evidence between claims.',{'claims':[{'index':i,'claim':c} for i,c in enumerate(items)]},schema,key,1800)
        verdicts=result.get('verdicts',[])
        if not isinstance(verdicts,list):return []
        valid={}
        for verdict in verdicts:
            if not isinstance(verdict,dict):continue
            i=verdict.get('index')
            if type(i) is int and 0<=i<len(items):valid.setdefault(i,[]).append(verdict.get('status'))
        return [c for i,c in enumerate(items) if valid.get(i)==['supported']]
    checked=await review(claims,system)
    if checked:
        accepted=await review(checked,system+' Independently audit unsupported additions, object substitutions, omitted hypotheses and invalid inferences. All details must follow from each claim’s own evidence.')

    return accepted

def explanation_cache_key(query,candidates,model,key,hop):
    revision=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    return hashlib.sha256(json.dumps([revision,query,[p['id'] for p in candidates],model,bool(key),hop],sort_keys=True).encode()).hexdigest()

def explanation_cache(cache_key,value=None):
    directory=Path(os.environ.get('STARVIEW_DATA_DIR',Path.home()/'.local/share/starview'));directory.mkdir(parents=True,exist_ok=True)
    path=directory/'rag-verified.sqlite3'
    with closing(sqlite3.connect(path,timeout=10)) as db:
        db.execute('CREATE TABLE IF NOT EXISTS explanations (key TEXT PRIMARY KEY, value TEXT, created REAL)');path.chmod(0o600)
        if value is not None:
            db.execute('INSERT OR REPLACE INTO explanations VALUES (?,?,?)',(cache_key,json.dumps(value),time.time()));db.commit();return value
        row=db.execute('SELECT value FROM explanations WHERE key=? AND created>?',(cache_key,time.time()-86400)).fetchone()
        return json.loads(row[0]) if row else None

async def explain(retrieval,query,candidates,model,key,hop=None):
    if not candidates:return []
    cache_key=explanation_cache_key(query,candidates,model,key,hop)
    cached=explanation_cache(cache_key)
    if cached:
        rebuilt=[{'text':c['text'],'kind':c['kind'],'evidence':[{'id':r['passage_id']} for r in c['evidence']]} for c in cached]
        checked=grounded_claims(retrieval,candidates,rebuilt,full_passages=True)
        if len(checked)==len(cached):return checked
    task='Write a substantive, self-contained explanation answering the question using only these passages. Organize up to six connected explanatory paragraphs: define the idea, explain its meaning and reasoning, and include supported examples or derivations when useful. Each paragraph must be fully supported by its attached quotes. Preserve hypotheses. Match depth to the question; do not substitute pointers to notes for an explanation. Do not claim exhaustive coverage when evidence is limited.'
    if comparison_topics(query):task+=' Compare the TWO subjects explicitly named in the question. Explain the difference in update rule, required inputs, assumptions, and convergence only where the passages support it. Do not substitute a different method or merely explain a relationship. Use multiple explanatory paragraphs when evidence permits.'
    if hop:task='Explain ONLY the mathematical connection from '+hop[0]+' to '+hop[1]+'. Give ONE concise complete sentence explaining the bridge, at most 35 words. Identify a concrete shared construction or specialization: for example, nth roots solve the particular polynomial equation w^n-z=0. A connection need not be a proof or prerequisite. Do not invent necessity claims such as essential for defining something. Do not mention filenames or narrate your process. Do not repeat the question or add a conclusion. Both notes must contribute substantive evidence; a reference link alone is not an explanation.'
    system=task+''' For every paragraph select the IDs of all passages needed to support it, including formulas and mathematical conditions. Use the JSON fields text, kind, evidence: [{id}]. The system attaches and validates source text automatically; do not copy quotes. Classify facts explicitly stated in the passages as stated; classify a justified combination of facts as inference. Never introduce other theorems, topics, or assumptions absent from the evidence. If evidence is insufficient return claims: []. Do not force a bridge. Distinguish a conceptual reference from implication or proof. Preserve mathematical hypotheses. Use LaTeX math delimiters in prose, correctly escaped in JSON. Do not add your own citation strings: citations are built from verified quotes.'''
    schema=copy.deepcopy(GENERATION)
    schema['properties']['claims']['maxItems']=1 if hop else 6
    if comparison_topics(query):
        schema['properties']['claims']['minItems']=3
        schema['properties']['claims']['maxItems']=4
    schema['properties']['claims']['items']['properties']['evidence']['items']['properties']['id']={'type':'string','enum':[p['id'] for p in candidates]}
    schema['properties']['claims']['items']['properties']['evidence']['items']=object_schema({'id':{'type':'string','enum':[p['id'] for p in candidates]}})
    if comparison_topics(query):
        sides={}
        for side,topic in zip(('left','right'),comparison_topics(query)):
            subject={term for term in terms(topic) if len(term)>2}-{'method','methods','difference','explain','tell','function','functions'}
            ids=[p['id'] for p in candidates if subject & set(re.findall(r'[a-z]+',(p['title']+' '+p['path']).lower()))]
            sides[side]={'type':'string','enum':ids or [p['id'] for p in candidates]}
        schema['properties']['claims']['items']['properties']['evidence']=object_schema(sides)
        system+=' For this comparison use evidence: {left: passage_id_for_first_subject, right: passage_id_for_second_subject}. Cite substantive support for BOTH methods in EACH paragraph.'
    supplied=candidates
    system+=' Answer the latest question directly and explain the mathematics rather than narrating retrieval. For a comparison, write three or four developed paragraphs: (1) explain both update rules with formulas and notation, (2) compare starting data and required assumptions, (3) explain practical tradeoffs and convergence guarantees only where the supplied evidence supports them. Each paragraph must be supported by its selected passage IDs. Each paragraph must add a DISTINCT difference; do not repeat the same derivative distinction in two paragraphs. Include the update formulas in the first paragraph and the number of initial guesses in the second when the sources provide them. Do not stop after naming the derivative difference. If a detail lacks evidence omit that detail, but explain the other supported distinctions.'
    data=await structured(model,system,{'question':query,'passages':supplied},schema,key,1600 if hop else 2400)
    if comparison_topics(query):
        for claim in data.get('claims',[]):
            if isinstance(claim,dict) and isinstance(claim.get('evidence'),dict):claim['evidence']=[{'id':value} for value in claim['evidence'].values()]
    claims=grounded_claims(retrieval,candidates,data.get('claims'),full_passages=True)
    claims=await verify_claims(claims,model,key)
    if hop:
        supported={ref['path'] for claim in claims for ref in claim['evidence']}
        if not set(hop)<=supported:claims=[]
    if claims:explanation_cache(cache_key,claims)
    return claims

def source_comparison(retrieval,passages,paths,titles):
    """Useful extractive evidence when generation fails; makes no inferred bridge."""
    candidates=[]
    topics=[set(re.findall(r"[a-z]{4,}",titles.get(path,path).lower()))-{'method','functions','complex','theorem'} for path in paths]
    for passage in passages:
        if passage['path'] not in paths:continue
        for line in passage['excerpt'].splitlines():
            line=line.strip()
            if not 30<=len(line)<=1600 or line.startswith('\\'):continue
            quote=locate_quote(retrieval,passage,line)
            if not quote:continue
            tokens=set(re.findall(r'[a-z]{4,}',line.lower()))
            coverage=sum(bool(tokens&topic) for topic in topics)
            candidates.append((coverage,len(line),quote))
    if not candidates:return 'I could not verify an explanation of this connection from your notes.'
    quote=max(candidates,key=lambda item:item[:2])[2]
    # An exact excerpt remains useful without asserting an unverified inference.
    return 'From your notes: “'+quote['quote']+'” ['+quote['path']+':'+str(quote['line_start'])+']'


def render_claim(claim):
    refs=list(dict.fromkeys('['+ref['path']+':'+str(ref['line_start'])+']' for ref in claim['evidence']))
    return ('Inference: ' if claim['kind']=='inference' else '')+claim['text']+' '+' '.join(refs)

async def grounded_answer(retrieval,prompt,model,key='',history=None):
    started=time.monotonic();corpus=evidence_passages(retrieval);plan=query_path(prompt,retrieval.graph);stage_seconds={}
    titles={d['path']:d['title'] for d in retrieval.graph['documents']};all_claims=[];steps=[];source_passages=[]
    if plan and plan['found']:
        lines=[]
        for a,b in zip(plan['paths'],plan['paths'][1:]):
            pair_passages=[]
            query=prompt+' Connection: '+titles.get(a,a)+' to '+titles.get(b,b)
            # Retrieve from each endpoint separately so neither side is displaced.
            for path in (a,b):pair_passages.extend(await hybrid_candidates(query,[p for p in corpus if p['path']==path],3))
            source_passages.extend(pair_passages)
            claims=await explain(retrieval,query,pair_passages,model,key,(a,b))
            status='supported' if claims else 'unsupported'
            steps.append({'source':a,'target':b,'status':status,'claims':claims})
            text=' '.join(render_claim(claim) for claim in claims) if claims else source_comparison(retrieval,pair_passages,(a,b),titles)
            lines.append(text)
            all_claims.extend(claims)
        answer='\n\n'.join(lines)
    elif plan:
        answer='No existing concept-only path connects '+titles.get(plan['endpoints'][0],plan['endpoints'][0])+' and '+titles.get(plan['endpoints'][1],plan['endpoints'][1])+'. I cannot present an existing chain of supported connections.'
        source_passages=[p for p in corpus if p['path'] in plan['paths']]
    else:
        query=prompt
        # Use a short preceding user question only to resolve genuine follow-ups.
        if re.search(r'\b(that|this|those|elaborate|explain more)\b',prompt,re.I):
            previous=next((m.get('content','') for m in reversed(history or []) if m.get('role')=='user'),'')
            query=previous[:1000]+'\n'+prompt
        broad=bool(re.search(r'\b(all|every|ways|uses|applications|overview)\b',query,re.I))
        stage=time.monotonic()
        comparison=comparison_topics(prompt)
        groups=[]
        if comparison:
            for topic in comparison:
                distinctive={term for term in terms(topic) if len(term)>2}-{'method','methods','difference','explain','tell','function','functions'}
                group=[p for p in corpus if distinctive and distinctive & set(re.findall(r'[a-z]+',(p['title']+' '+p['path']).lower()))]
                groups.append(group)
            missing=[topic for topic,group in zip(comparison,groups) if not group]
            if missing:
                return {'answer':'I could not find evidence for '+', '.join(missing)+' in your notes, so I cannot give a supported comparison yet.','citations':[],'sources':[],'proposal':None,'concept_path':None,'model':model,'timing':{'elapsed_seconds':round(time.monotonic()-started,2)}}
            candidates=[]
            for topic,group in zip(comparison,groups):
                ranked=await hybrid_candidates(topic,group,3)
                convergence=next((p for p in group if 'convergence' in p.get('heading','').lower()),None)
                if convergence and convergence['id'] not in {p['id'] for p in ranked}:ranked.append(convergence)
                candidates.extend(ranked)
            candidates=list({p['id']:p for p in candidates}.values())
        else:
            candidates=await hybrid_candidates(query,corpus,24 if broad else 12)
        stage_seconds['retrieval']=round(time.monotonic()-stage,3);stage=time.monotonic()
        selected=candidates if comparison else await rerank(retrieval,query,candidates,model,key)
        stage_seconds['reranking']=round(time.monotonic()-stage,3);stage=time.monotonic()
        if comparison:
            for group in groups:
                ids={p['id'] for p in group}
                matches=[p for p in candidates if p['id'] in ids]
                for p in matches[:2]:
                    if p['id'] not in {v['id'] for v in selected}:selected.append(p)
        all_claims=await explain(retrieval,query,selected,model,key)
        if comparison:
            cited={ref['passage_id'] for claim in all_claims for ref in claim['evidence']}
            supported_text=' '.join(p['title']+' '+p['excerpt'] for p in selected if p['id'] in cited).lower()
            answer_text=' '.join(c['text'] for c in all_claims).lower()
            for topic in comparison:
                subject={term for term in terms(topic) if len(term)>2}-{'method','methods','difference','explain','tell','function','functions'}
                if not subject or not any(term in supported_text and term in answer_text for term in subject):all_claims=[];break
        stage_seconds['generation_and_verification']=round(time.monotonic()-stage,3)
        used={ref['passage_id'] for claim in all_claims for ref in claim['evidence']}
        source_passages=[p for p in selected if p['id'] in used]
        answer='\n\n'.join(render_claim(claim) for claim in all_claims) if all_claims else 'I could not support an answer from the retrieved notes. Try a more specific question or add relevant evidence.'
    sources=[];seen=set()
    for passage in source_passages:
        if passage['id'] in seen:continue
        seen.add(passage['id']);sources.append({k:passage[k] for k in ('path','title','line_start','line_end','excerpt')})
    citations=list(dict.fromkeys(ref['path'] for claim in all_claims for ref in claim['evidence']))
    return {'answer':answer,'citations':citations,'sources':sources,'proposal':None,'concept_path':plan,'model':model,'grounding':{'method':'hybrid-retrieval-and-claim-checking','quotes_verified':True,'verification':'model-based, not a formal proof','steps':steps},'timing':{'stages':stage_seconds,'elapsed_seconds':round(time.monotonic()-started,2),'prompt_tokens':None,'output_tokens':None}}
