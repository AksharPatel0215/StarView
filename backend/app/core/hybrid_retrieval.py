"""Local dense + BM25 retrieval, fused with reciprocal rank fusion."""
import hashlib
import json
import math
import os
import sqlite3
from collections import Counter
from pathlib import Path
import httpx
from app.core.retrieval import words

EMBED_MODEL=os.environ.get('STARVIEW_EMBED_MODEL','embeddinggemma')

def cosine(a,b):
    if len(a)!=len(b) or not a:raise ValueError('Embedding dimensions differ')
    denominator=math.sqrt(sum(x*x for x in a)*sum(x*x for x in b))
    return sum(x*y for x,y in zip(a,b))/denominator if denominator else 0

async def embed(texts):
    directory=Path(os.environ.get('STARVIEW_DATA_DIR',Path.home()/'.local/share/starview'))
    directory.mkdir(parents=True,exist_ok=True)
    path=directory/'rag-embeddings.sqlite3'
    connection=sqlite3.connect(path,timeout=30)
    try:
        connection.execute('CREATE TABLE IF NOT EXISTS vectors (key TEXT PRIMARY KEY, vector TEXT NOT NULL)')
        path.chmod(0o600)
        keys=[hashlib.sha256(('v1:'+EMBED_MODEL+':'+text).encode()).hexdigest() for text in texts]
        vectors={}
        for key in keys:
            row=connection.execute('SELECT vector FROM vectors WHERE key=?',(key,)).fetchone()
            if row:vectors[key]=json.loads(row[0])
        missing=list(dict.fromkeys(key for key in keys if key not in vectors))
        lookup=dict(zip(keys,texts))
        async with httpx.AsyncClient(timeout=httpx.Timeout(120,connect=10),trust_env=False) as client:
            for start in range(0,len(missing),16):
                batch=missing[start:start+16]
                response=await client.post('http://127.0.0.1:11434/api/embed',json={'model':EMBED_MODEL,'input':[lookup[key] for key in batch],'truncate':False,'dimensions':256,'keep_alive':'10m'})
                response.raise_for_status();embeddings=response.json()['embeddings']
                if len(embeddings)!=len(batch):raise ValueError('Embedding count differs')
                for key,vector in zip(batch,embeddings):
                    if not vector or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in vector):raise ValueError('Invalid embedding')
                    vectors[key]=vector
                    connection.execute('INSERT OR REPLACE INTO vectors VALUES (?,?)',(key,json.dumps(vector)))
                connection.commit()
        return [vectors[key] for key in keys]
    except (httpx.HTTPError,ValueError,KeyError) as error:
        raise RuntimeError('Local semantic embeddings are unavailable. Start Ollama and install '+EMBED_MODEL+'. No keyword-only answer was substituted.') from error
    finally:connection.close()

def bm25_scores(query,documents):
    tokenized=[Counter(words(d['title']+' '+d.get('heading','')+' '+d['path']+' '+d['excerpt'])) for d in documents]
    n=len(tokenized);average=sum(sum(c.values()) for c in tokenized)/max(1,n) or 1
    query_terms=set(words(query));frequencies={term:sum(term in c for c in tokenized) for term in query_terms}
    return [sum(math.log(1+(n-frequencies[t]+.5)/(frequencies[t]+.5))*c[t]*2.2/(c[t]+1.2*(.25+.75*sum(c.values())/average)) for t in query_terms if c[t]) for c in tokenized]

async def hybrid_candidates(query,documents,limit=24):
    if not documents:return []
    inputs=['title: '+d['title']+' | text: '+d.get('heading','')+'\n'+d['excerpt'] for d in documents]
    vectors=await embed(inputs+['task: search result | query: '+query])
    dense=[cosine(v,vectors[-1]) for v in vectors[:-1]];lexical=bm25_scores(query,documents)
    rankings=[sorted(range(len(documents)),key=lambda i:dense[i],reverse=True),sorted((i for i,s in enumerate(lexical) if s>0),key=lambda i:lexical[i],reverse=True)]
    fused=Counter()
    for ranking in rankings:
        for rank,index in enumerate(ranking[:36],1):fused[index]+=1/(60+rank)
    return [{**documents[i],'retrieval_score':fused[i],'semantic_similarity':dense[i]} for i in sorted(fused,key=fused.get,reverse=True)[:limit]]
