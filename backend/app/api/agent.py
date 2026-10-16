from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.api.projects import project_manager
from app.core.agent_review import Change, ReviewStore
from app.services.note_agent import ask, ollama_status, call_tool

router=APIRouter(prefix='/api')
class Chat(BaseModel):
    prompt:str=Field(min_length=1,max_length=8000)
    model:str=Field(default='',max_length=100)
    current:str=Field(default='',max_length=400)
    history:list[dict]=Field(default_factory=list,max_length=16)
class Approval(BaseModel):
    changes:list[Change]|None=Field(default=None,max_length=12)
class Search(BaseModel):
    query:str=Field(min_length=1,max_length=4000)

def root(name):
    p=project_manager.get_project(name)
    if not p: raise HTTPException(404,'Workspace not found')
    return p.root

def safe(fn):
    try: return fn()
    except FileNotFoundError as e: raise HTTPException(404,'Proposal or note not found') from e
    except (ValueError,OSError) as e: raise HTTPException(409,str(e)) from e

@router.get('/agent/status')
async def status(): return await ollama_status()

@router.post('/projects/{name}/agent/chat')
async def chat(name:str,body:Chat):
    directory=root(name)
    try: return await ask(directory,body.prompt,body.model,body.current,body.history)
    except RuntimeError as e: raise HTTPException(503,str(e)) from e
    except (ValueError,OSError) as e: raise HTTPException(400,str(e)) from e

@router.post('/projects/{name}/agent/search')
def search(name:str,body:Search): return safe(lambda:call_tool(root(name),'search_notes',{'query':body.query}))

@router.get('/projects/{name}/agent/proposals')
def proposals(name:str): return safe(lambda:ReviewStore(root(name)).pending())

@router.post('/projects/{name}/agent/proposals/{id}/approve')
def approve(name:str,id:str,body:Approval):
    return safe(lambda:ReviewStore(root(name)).apply(id,[c.model_dump() for c in body.changes] if body.changes is not None else None))

@router.post('/projects/{name}/agent/proposals/{id}/reject')
def reject(name:str,id:str): return safe(lambda:ReviewStore(root(name)).reject(id))

class DraftPreview(BaseModel):
    content:str=Field(min_length=1,max_length=200000)
    path:str=Field(default='draft.tex',max_length=400)

@router.post('/projects/{name}/agent/preview')
def preview(name:str,body:DraftPreview):
    from tempfile import TemporaryDirectory
    from pathlib import Path
    from fastapi.responses import Response
    from app.core.latex import LatexCompiler
    from app.core.filesystem import FileSystem
    from app.core.wikilinks import transform
    directory=root(name)
    path=Path(body.path)
    if path.is_absolute() or '..' in path.parts or path.suffix.lower()!='.tex':
        raise HTTPException(400,'Preview requires a relative .tex path')
    documents=[p.as_posix() for p in FileSystem(directory).list_files() if p.suffix.lower()=='.tex']
    content=transform(directory,body.path,body.content,documents+[body.path])
    if r'\href' in content and 'hyperref' not in content:
        content=content.replace(r'\begin{document}',r'\usepackage{hyperref}'+'\n'+r'\begin{document}',1)
    # Drafts compile in isolation. Preview never writes the proposed note or applies changes.
    with TemporaryDirectory(prefix='starview-draft-') as temporary:
        stage=Path(temporary)
        (stage/'draft.tex').write_text(content,encoding='utf-8')
        try: result=LatexCompiler().compile(stage,'draft.tex')
        except RuntimeError as error: raise HTTPException(503,str(error)) from error
        if not result['success']: raise HTTPException(422,result)
        return Response((stage/result['pdf']).read_bytes(),media_type='application/pdf',headers={'Cache-Control':'no-store'})
