from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from app.api.projects import project_manager
from app.core.nodes import WorkspaceNodes
from app.core.knowledge import KnowledgeGraph
from app.core.filesystem import FileSystem
from app.services.accounts import Accounts

router = APIRouter(prefix='/api/projects/{name}/workspace')

class Resource(BaseModel):
    provider: str
    id: str = Field(max_length=200)

class NodeCreate(BaseModel):
    kind: str
    title: str = Field(max_length=120)
    targets: list[str] = Field(default_factory=list, max_length=1000)
    resource: Resource | None = None

class NodeUpdate(BaseModel):
    id: str
    title: str = Field(max_length=120)
    targets: list[str] = Field(max_length=1000)


def store(name):
    project = project_manager.get_project(name)
    if not project:
        raise HTTPException(404, 'Project not found')
    try:
        return WorkspaceNodes(project.root)
    except ValueError:
        raise HTTPException(400, 'Invalid workspace metadata path')


def safe(operation):
    try:
        return operation()
    except FileNotFoundError as error:
        raise HTTPException(404, str(error))
    except (ValueError, OSError) as error:
        raise HTTPException(400, str(error))

@router.get('/nodes')
def nodes(name: str):
    return safe(lambda: store(name).read()['nodes'])

@router.post('/nodes')
def create_node(name: str, body: NodeCreate, request: Request):
    resource = Accounts(request.app.state.security).resource(body.resource.provider, body.resource.id) if body.resource and body.kind == 'data' else None
    return safe(lambda: store(name).create(body.kind, body.title, body.targets, resource))

@router.put('/nodes')
def update_node(name: str, body: NodeUpdate):
    return safe(lambda: store(name).update(body.id, body.title, body.targets))

@router.get('/stats')
def statistics(name: str, node: str = ''):
    def calculate():
        workspace = store(name)
        graph = KnowledgeGraph(workspace.root).graph()
        selected = workspace.get(node) if node else None
        targets = set(selected['targets']) if selected else None
        documents = [item for item in graph['documents'] if item.get('kind', 'document') == 'document' and (targets is None or item['path'] in targets)]
        ids = {item['path'] for item in documents}
        links = [link for link in graph['links'] if not link['missing'] and link['source'] in ids and link['target'] in ids]
        degree = {path: sum(link['source'] == path or link['target'] == path for link in links) for path in ids}
        tags = {}
        for document in documents:
            for tag in document['tags']:
                tags[tag] = tags.get(tag, 0) + 1
        nodes = workspace.read()['nodes']
        data = [item for item in nodes if item['kind'] == 'data' and (targets is None or item['id'] in targets)]
        all_files = FileSystem(workspace.root).list_files()
        assets = sum(path.suffix.lower() in {'.png','.jpg','.jpeg','.svg','.webp','.pdf','.gif','.eps'} and not (path.suffix.lower()=='.pdf' and path.with_suffix('.tex').as_posix() in ids) for path in all_files) if targets is None else None
        return {'documents': len(documents), 'connections': len(links), 'isolated': sum(value == 0 for value in degree.values()), 'unresolved': sum(link['missing'] for link in graph['links'] if targets is None or link['source'] in targets), 'data_nodes': len(data), 'dashboards': sum(item['kind'] == 'dashboard' for item in nodes), 'assets': assets, 'tags': sorted([{'name': tag, 'count': count} for tag,count in tags.items()], key=lambda item: (-item['count'], item['name'])), 'hubs': sorted([{'path': item['path'], 'title': item['title'], 'connections': degree[item['path']]} for item in documents], key=lambda item: (-item['connections'], item['title']))[:6], 'scope': 'connected' if selected else 'workspace'}
    return safe(calculate)

@router.get('/preview')
def preview(name: str, id: str, request: Request, pdf: bool = False):
    node = safe(lambda: store(name).get(id))
    if node['kind'] != 'data':
        raise HTTPException(400, 'Choose a data node')
    result = Accounts(request.app.state.security).preview(node['resource'])
    if result['kind'] == 'pdf':
        if pdf:
            return Response(result['content'], media_type='application/pdf', headers={'Content-Disposition': 'inline'})
        return {'kind': 'pdf'}
    if pdf:
        raise HTTPException(400, 'This resource is not a PDF')
    return result
