import re
from collections import deque
from pathlib import Path

def comparison_topics(prompt):
    match=re.search(r'\b(?:difference(?:s)?\s+between|compare)\s+(.+?)\s+(?:and|with|versus|vs\.?)\s+(.+?)[?.!]*$',prompt,re.I)
    if not match:return None
    return tuple(part.strip(' ?.!') for part in match.groups())

def path_question(prompt):
    if comparison_topics(prompt):return False
    return bool(re.search(r'\b(how|what|explain|relationship|connection|path)\b',prompt,re.I) and re.search(r'\b(connect\w*|relat\w*|path|between)\b',prompt,re.I)) and not bool(re.search(r'\b(create|add|remove|delete|draft|write|edit|update|modify|propose|suggest)\b',prompt,re.I))

def concept_node(doc):
    return doc.get('kind','document')=='document' and Path(doc['path']).stem.lower() not in {'index','overview','main'} and not set(doc.get('tags',[]))&{'section','workspace','overview'}

def terms(text):
    stop={'how','does','do','the','of','a','an','to','and','is','in','complex','number','numbers','what','between','connect','connection','relate','relationship','through','me','show','explain'}
    return {('geometric' if word=='geometry' else word) for word in re.findall(r'[a-z]+',text.lower()) if word not in stop}

def resolve(phrase,documents):
    query=terms(phrase)
    ranked=[]
    for doc in documents:
        if not concept_node(doc):continue
        title=terms(doc['title']);stem=terms(Path(doc['path']).stem)
        overlap=query&(title|stem)
        if not overlap:continue
        score=8*len(query&stem)+4*len(query&title)+6*len(overlap)/max(1,len(query))+2*len(overlap)/max(1,len(title|stem))
        ranked.append((score,doc['path']))
    return max(ranked)[1] if ranked else None

def query_path(prompt,graph):
    if not path_question(prompt):return None
    match=re.search(r'(?:how\s+(?:does|do)\s+)?(.+?)\s+(?:connect\w*\s+(?:to|with)|relat\w*\s+to)\s+(.+?)[?.]*$',prompt,re.I)
    if not match:match=re.search(r'(?:between|from)\s+(.+?)\s+(?:and|to)\s+(.+?)[?.]*$',prompt,re.I)
    if not match:return None
    start,end=(resolve(part,graph['documents']) for part in match.groups())
    if not start or not end or start==end:return None
    allowed={d['path'] for d in graph['documents'] if concept_node(d)}
    adjacency={p:set() for p in allowed}
    for edge in graph['links']:
        a,b=edge['source'],edge['target']
        if not edge.get('missing') and a in allowed and b in allowed:
            adjacency[a].add(b);adjacency[b].add(a)
    previous={start:None};queue=deque([start])
    while queue and end not in previous:
        current=queue.popleft()
        for neighbor in sorted(adjacency[current]):
            if neighbor not in previous:previous[neighbor]=current;queue.append(neighbor)
    if end not in previous:return {'endpoints':[start,end],'paths':[start,end],'found':False}
    path=[];current=end
    while current is not None:path.append(current);current=previous[current]
    return {'endpoints':[start,end],'paths':list(reversed(path)),'found':True}
