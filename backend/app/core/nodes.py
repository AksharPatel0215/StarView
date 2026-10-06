import json
import os
import re
import tempfile
import uuid
from pathlib import Path
from threading import RLock

_LOCK = RLock()

class WorkspaceNodes:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.store = self.root / '.starview' / 'nodes.json'
        self.store.resolve().relative_to(self.root)

    def read(self):
        if not self.store.exists():
            return {'version': 1, 'nodes': []}
        value = json.loads(self.store.read_text())
        if not isinstance(value, dict) or value.get('version') != 1 or not isinstance(value.get('nodes'), list):
            raise ValueError('Invalid workspace nodes file')
        if len(value['nodes']) > 1000:
            raise ValueError('Workspace supports up to 1,000 extra nodes')
        seen = set()
        for node in value['nodes']:
            if not isinstance(node, dict) or node.get('kind') not in {'data', 'dashboard'} or not isinstance(node.get('id'), str) or not isinstance(node.get('title'), str) or not isinstance(node.get('targets'), list) or not all(isinstance(target, str) for target in node['targets']):
                raise ValueError('Invalid workspace node')
            if not re.fullmatch(r'@node/[a-f0-9]{32}', node['id']) or node['id'] in seen or len(node['targets']) > 1000 or not 1 <= len(node['title']) <= 120:
                raise ValueError('Invalid workspace node')
            seen.add(node['id'])
            if node['kind'] == 'data' and (not isinstance(node.get('resource'), dict) or node['resource'].get('provider') not in {'google','microsoft'} or not isinstance(node['resource'].get('id'), str)):
                raise ValueError('Invalid data resource')
        return value

    def save(self, value):
        self.store.resolve().relative_to(self.root)
        self.store.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile('w', dir=self.store.parent, delete=False) as file:
            temporary = Path(file.name)
            json.dump(value, file, indent=2)
        try:
            os.replace(temporary, self.store)
        finally:
            temporary.unlink(missing_ok=True)

    def create(self, kind, title, targets, resource=None):
        if kind not in {'data', 'dashboard'} or not 1 <= len(title.strip()) <= 120:
            raise ValueError('Choose a node type and a title of up to 120 characters')
        if kind == 'data' and (not resource or resource.get('provider') not in {'google', 'microsoft'}):
            raise ValueError('Choose a connected resource')
        with _LOCK:
            value = self.read()
            if len(value['nodes']) >= 1000:
                raise ValueError('Workspace supports up to 1,000 extra nodes')
            ids = {node['id'] for node in value['nodes']}
            checked = self.targets(targets, ids)
            node = {'id': '@node/' + uuid.uuid4().hex, 'kind': kind, 'title': title.strip(), 'targets': checked, 'resource': resource if kind == 'data' else None}
            value['nodes'].append(node)
            self.save(value)
        return node

    def targets(self, targets, ids):
        if len(targets) > 1000:
            raise ValueError('Too many connections')
        checked = []
        for target in dict.fromkeys(targets):
            if target.startswith('@node/'):
                if target not in ids:
                    raise ValueError('Workspace node not found')
            else:
                source = (self.root / target).resolve()
                relative = source.relative_to(self.root)
                if source.suffix.lower() != '.tex' or any(part.startswith('.') for part in relative.parts) or not source.is_file():
                    raise ValueError('Choose an existing LaTeX document or workspace node')
                target = relative.as_posix()
            checked.append(target)
        return checked

    def update(self, node_id, title, targets):
        with _LOCK:
            value = self.read()
            node = next((node for node in value['nodes'] if node['id'] == node_id), None)
            if not node:
                raise FileNotFoundError('Workspace node not found')
            if not 1 <= len(title.strip()) <= 120 or node_id in targets:
                raise ValueError('Choose a title and connections to other nodes')
            node['title'] = title.strip()
            node['targets'] = self.targets(targets, {item['id'] for item in value['nodes']})
            self.save(value)
        return node

    def get(self, node_id):
        node = next((node for node in self.read()['nodes'] if node['id'] == node_id), None)
        if not node:
            raise FileNotFoundError('Workspace node not found')
        return node
