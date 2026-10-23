"""Current, clean LaTeX passages and exact quote-to-source attribution."""
import hashlib
import re

VERSION='evidence-v2'

def evidence_passages(retrieval,allowed=None):
    result=[]
    for path,doc in retrieval.documents.items():
        if allowed is not None and path not in allowed:continue
        try:lines=retrieval.read(path).splitlines()
        except (OSError,ValueError,UnicodeError):continue
        body=not any(r'\begin{document}' in line for line in lines)
        diagram=0;navigation=False;chunk=[];heading=''
        def flush():
            if not chunk:return
            excerpt='\n'.join(line for _,line in chunk)
            if len(re.sub(r'\\[a-zA-Z]+|[^a-zA-Z0-9]','',excerpt))<12:chunk.clear();return
            digest=hashlib.sha256((VERSION+path+str(chunk[0][0])+excerpt).encode()).hexdigest()[:20]
            result.append({'id':digest,'path':path,'title':doc['title'],'heading':heading,'line_start':chunk[0][0],'line_end':chunk[-1][0],'excerpt':excerpt})
            chunk.clear()
        for number,raw in enumerate(lines,1):
            if r'\begin{document}' in raw:body=True;continue
            if not body:continue
            if r'\end{document}' in raw:break
            if re.search(r'\\begin\{(?:tikzpicture|axis|pgfpicture)\}',raw):flush();diagram+=1
            if diagram:
                if re.search(r'\\end\{(?:tikzpicture|axis|pgfpicture)\}',raw):diagram-=1
                continue
            line=re.split(r'(?<!\\)%',raw,maxsplit=1)[0].strip()
            section=re.search(r'\\(?:sub)*section\*?\{(.+)\}',line)
            if section:
                flush();heading=section.group(1);navigation=bool(re.search(r'\b(connections|links|related notes|see also)\b',heading,re.I))
            if navigation:continue
            if not line:
                if sum(len(s) for _,s in chunk)>550:flush()
                continue
            if re.fullmatch(r'(?:\\maketitle|\\(?:smallskip|medskip|bigskip|centering)|\\(?:begin|end)\{(?:center|figure|itemize|enumerate)\}(?:\[.*\])?)',line):continue
            if '[[' in line and (line.startswith(r'\item') or re.search(r'\\textbf\{Related:',line)):continue
            without_links=re.sub(r'\[\[.*?\]\]','',line)
            if '[[' in line and not re.sub(r'\\(?:noindent|smallskip)|[;\s]','',without_links):continue
            if sum(len(s) for _,s in chunk)+len(line)>1400:flush()
            chunk.append((number,line))
        flush()
    return result

def locate_quote(retrieval,passage,quote):
    """Match within the supplied passage AND source span, returning actual line numbers."""
    if not isinstance(quote,str) or len(quote.strip())<12:return None
    normalize=lambda s:' '.join(s.split())
    if normalize(quote) not in normalize(passage['excerpt']):return None
    lines=retrieval.read(passage['path']).splitlines()
    text='\n'.join(re.split(r'(?<!\\)%',line,maxsplit=1)[0] for line in lines[passage['line_start']-1:passage['line_end']])
    tokens=list(re.finditer(r'\S+',text));normalized=' '.join(t.group() for t in tokens)
    target=normalize(quote);start=normalized.find(target)
    if start<0:return None
    offsets=[];position=0
    for token in tokens:
        offsets.append((position,position+len(token.group()),token.start(),token.end()));position+=len(token.group())+1
    first=next((item for item in offsets if item[1]>start),None)
    last=next((item for item in reversed(offsets) if item[0]<start+len(target)),None)
    if not first or not last:return None
    return {'passage_id':passage['id'],'path':passage['path'],'line_start':passage['line_start']+text[:first[2]].count('\n'),'line_end':passage['line_start']+text[:last[3]].count('\n'),'quote':quote}
