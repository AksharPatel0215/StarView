"""The model can stage proposals. Only the authenticated UI can approve them."""
import hashlib
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from app.core.filesystem import FileSystem
from app.core.knowledge import KnowledgeGraph

LOCK = RLock()
class Change(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['create_note','update_note','connect','disconnect','label_connection']
    path: str = Field(default='', max_length=400)
    content: str = Field(default='', max_length=100_000)
    source: str = Field(default='', max_length=400)
    target: str = Field(default='', max_length=400)
    labels: list[str] = Field(default_factory=list, max_length=8)
    reason: str = Field(default='', max_length=1000)

class AgentAnswer(BaseModel):
    model_config = ConfigDict(extra='forbid')
    answer: str = Field(max_length=20_000)
    citations: list[str] = Field(default_factory=list,max_length=12)
    changes: list[Change] = Field(default_factory=list,max_length=12)


def fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def atomic(path, content):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as f:
        temporary=Path(f.name);f.write(content)
    try: os.replace(temporary,path)
    finally: temporary.unlink(missing_ok=True)

class ReviewStore:
    def __init__(self, root):
        self.root=Path(root).resolve()
        self.directory=self.root/'.starview'/'agent'/'proposals'
        self.directory.resolve().relative_to(self.root)

    def note(self, value):
        p=Path(value)
        if not value or p.is_absolute() or '\\' in value or any(x.startswith('.') for x in p.parts) or p.suffix.lower() != '.tex':
            raise ValueError('Agent changes must target visible .tex notes inside this workspace')
        path=self.root/p
        path.resolve().relative_to(self.root)
        if path.is_symlink(): raise ValueError('Agent changes cannot target symbolic links')
        return path

    def file(self, id):
        if not isinstance(id,str) or len(id)!=32 or any(c not in '0123456789abcdef' for c in id): raise ValueError('Invalid proposal')
        path=self.directory/(id+'.json');path.resolve().relative_to(self.root)
        return path

    def validate(self, changes):
        graph=KnowledgeGraph(self.root).graph()
        existing={d['path'] for d in graph['documents'] if d.get('kind','document')=='document'}
        created=set(); paths=[]
        for change in changes:
            if change.kind in {'create_note','update_note'}:
                path=self.note(change.path)
                if change.path in paths: raise ValueError('A proposal can change each note only once')
                paths.append(change.path)
                if change.kind=='create_note':
                    if path.exists(): raise ValueError('New note already exists: '+change.path)
                    created.add(change.path)
                elif change.path not in existing: raise ValueError('Note not found: '+change.path)
                if not change.content.strip(): raise ValueError('Draft note cannot be empty')
                if change.kind=='create_note' and not ('\\documentclass' in change.content and '\\begin{document}' in change.content and '\\end{document}' in change.content):
                    raise ValueError('New notes must be complete LaTeX documents')
        for change in changes:
            if change.kind in {'create_note','update_note'}: continue
            self.note(change.source); self.note(change.target)
            if change.source==change.target: raise ValueError('A note cannot connect to itself')
            if any(p not in existing|created for p in (change.source,change.target)): raise ValueError('Connection endpoint does not exist')
            edge=next((e for e in graph['links'] if e['source']==change.source and e['target']==change.target),None)
            if change.kind in {'disconnect','label_connection'} and not edge: raise ValueError('Connection no longer exists')
            if change.kind=='disconnect' and edge.get('kind') in {'inline','both'}:
                raise ValueError('This relationship is also written in the source. Propose a note edit to remove the inline link.')
            if any(not label.strip() or len(label)>60 for label in change.labels): raise ValueError('Use short, nonempty relationship labels')
        return paths

    def stage(self, changes, answer='', citations=None):
        if not isinstance(changes,list) or not 1 <= len(changes) <= 12: raise ValueError('Propose between one and twelve changes at a time')
        parsed=[Change.model_validate(c) for c in changes]
        with LOCK:
            paths=self.validate(parsed)
            affected=set(paths)|{c.source for c in parsed if c.source}|{c.target for c in parsed if c.target}|{'.starview/links.json','.starview/graph.json'}
            before={p:(self.root/p).read_text(encoding='utf-8') if (self.root/p).exists() else None for p in paths}
            proposal={'id':uuid.uuid4().hex,'status':'pending','created_at':datetime.now(timezone.utc).isoformat(),'answer':answer,'citations':citations or [],'changes':[c.model_dump() for c in parsed],'before':before,'before_edges':[e for e in KnowledgeGraph(self.root).graph()['links'] if any(c.source==e['source'] and c.target==e['target'] for c in parsed)],'expected':{p:fingerprint(self.root/p) for p in affected}}
            atomic(self.file(proposal['id']),json.dumps(proposal,indent=2).encode())
            return proposal

    def get(self,id): return json.loads(self.file(id).read_text())
    def pending(self):
        if not self.directory.exists(): return []
        return sorted([json.loads(p.read_text()) for p in self.directory.glob('*.json') if not p.is_symlink() and json.loads(p.read_text()).get('status')=='pending'],key=lambda p:p['created_at'])

    def reject(self,id):
        with LOCK:
            p=self.get(id)
            if p['status']!='pending': raise ValueError('Proposal already reviewed')
            p['status']='rejected';atomic(self.file(id),json.dumps(p).encode());return p

    def apply(self,id,edited=None):
        with LOCK:
            proposal=self.get(id)
            if proposal['status']!='pending': raise ValueError('Proposal already reviewed')
            changes=[Change.model_validate(c) for c in (edited if edited is not None else proposal['changes'])]
            # Approval can edit draft text/labels/reasons but cannot introduce a different target/action.
            identity=lambda c:(c.kind,c.path,c.source,c.target)
            if [identity(c) for c in changes] != [identity(Change.model_validate(c)) for c in proposal['changes']]:
                raise ValueError('Targets changed. Request a new proposal for those changes.')
            for p,hash in proposal['expected'].items():
                path=self.root/p;path.resolve().relative_to(self.root)
                if fingerprint(path)!=hash: raise ValueError('Workspace changed since this proposal. Ask the agent to revise it before approving.')
            paths=self.validate(changes)
            metadata=['.starview/links.json','.starview/graph.json']
            backups={p:(self.root/p).read_bytes() if (self.root/p).exists() else None for p in paths+metadata}
            graph=KnowledgeGraph(self.root)
            try:
                for c in changes:
                    if c.kind=='create_note': FileSystem(self.root).create_file(c.path,c.content)
                    elif c.kind=='update_note': atomic(self.note(c.path),c.content.encode())
                for c in changes:
                    if c.kind=='connect':
                        graph.connect(c.source,c.target)
                        if c.labels: graph.label_edge(c.source,c.target,c.labels)
                    elif c.kind=='disconnect': graph.disconnect(c.source,c.target)
                    elif c.kind=='label_connection': graph.label_edge(c.source,c.target,c.labels)
                proposal['status']='applied';proposal['changes']=[c.model_dump() for c in changes]
                proposal['applied_at']=datetime.now(timezone.utc).isoformat()
                atomic(self.file(id),json.dumps(proposal,indent=2).encode())
            except Exception:
                for p,content in backups.items():
                    path=self.root/p
                    if content is None: path.unlink(missing_ok=True)
                    else: atomic(path,content)
                raise
            return proposal
