"""Local passage retrieval with graph expansion; no cloud or embedding service needed."""
import math
import re
from collections import Counter
from pathlib import Path
from app.core.knowledge import KnowledgeGraph

STOP = set('a an the of to in is are for and or it be with how what my notes explain create note please all every ways way used use uses important importance tell show about does how can could would should'.split())

def words(text):
    return [word for word in re.findall(r'[\w-]+', text.casefold().replace('-', ' ')) if word not in STOP and len(word) > 1]

class NoteRetrieval:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.graph = KnowledgeGraph(root).graph()
        self.documents = {d['path']: d for d in self.graph['documents'] if d.get('kind', 'document') == 'document'}

    def read(self, path):
        if path not in self.documents:
            raise ValueError('Choose an existing LaTeX note in this workspace')
        resolved = (self.root / path).resolve()
        resolved.relative_to(self.root)
        if resolved.stat().st_size > 500_000:
            raise ValueError('This note is too large for the local agent')
        return resolved.read_text(encoding='utf-8')

    def neighbors(self, path):
        if path not in self.documents:
            raise ValueError('Note not found')
        edges = [e for e in self.graph['links'] if not e['missing'] and path in (e['source'], e['target'])]
        return {'note': self.documents[path], 'relationships': edges, 'notes': [d for p,d in self.documents.items() if p != path and any(p in (e['source'], e['target']) for e in edges)]}

    def search(self, query, limit=8, current=''):
        # Rebuild from current files on each query, so edits, moves and deletions cannot leave stale hits.
        chunks = []
        for path, doc in self.documents.items():
            try:
                lines = self.read(path).splitlines()
            except (OSError, ValueError, UnicodeError):
                continue
            body=next((i for i,line in enumerate(lines) if r'\begin{document}' in line),0)
            starts=set(range(body,len(lines),30))|{i for i,line in enumerate(lines) if i>=body and re.search(r'\\(?:sub)*section\*?\{',line)}
            for start in sorted(starts):
                excerpt = '\n'.join(lines[start:start+40])[:4000]
                terms = Counter(words(doc['title']+' '+path+' '+excerpt))
                chunks.append({'path':path,'title':doc['title'],'line_start':start+1,'line_end':min(len(lines),start+40),'excerpt':excerpt,'terms':terms})
        query_terms = set(words(query))
        frequencies = Counter(t for c in chunks for t in c['terms'])
        total = max(1,len(chunks))
        average = sum(sum(c['terms'].values()) for c in chunks)/total or 1
        for c in chunks:
            headings=re.findall(r'\\(?:sub)*section\*?\{([^}]+)\}',c['excerpt'])
            heading_terms=set(words(' '.join(headings)))
            length = sum(c['terms'].values())
            c['score'] = sum(math.log(1+(total-frequencies[t]+.5)/(frequencies[t]+.5))*c['terms'][t]*2.2/(c['terms'][t]+1.2*(.25+.75*length/average)) for t in query_terms if c['terms'][t])
            filename_terms=set(words(Path(c['path']).stem))
            title_terms=set(words(c['title']))
            c['score'] += 16*len(query_terms & filename_terms) + 6*len(query_terms & title_terms)
            c['score'] += 3*len(query_terms & heading_terms)
            c['score'] += (2 if c['path'] == current and query_terms.intersection(c['terms']) else 0)
        ranked = sorted(chunks,key=lambda c:-c['score'])
        hits=[]; per_file=Counter()
        # Cover distinct documents before spending the context budget on repeated passages.
        for per_document in (1,2):
            for c in ranked:
                if c['score'] <= 0 or per_file[c['path']] >= per_document: continue
                if any(h['path']==c['path'] and h['line_start']==c['line_start'] for h in hits): continue
                per_file[c['path']] += 1
                hits.append({k:v for k,v in c.items() if k != 'terms'})
                if len(hits) >= max(1,min(12,limit)): break
            if len(hits) >= max(1,min(12,limit)): break
        # Include a supporting graph neighbor, even if the question uses different vocabulary.
        linked=[]
        if hits:
            neighbors=self.neighbors(hits[0]['path'])['notes']
            used={h['path'] for h in hits}
            for d in neighbors:
                if d['path'] in used: continue
                match=next((c for c in ranked if c['path']==d['path']),None)
                if match:
                    linked.append({k:v for k,v in match.items() if k != 'terms'})
                if len(linked)==2: break
        return (hits+linked)[:12]
