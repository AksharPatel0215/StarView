"""Workspace file moves and recoverable trash, with reference-preserving moves."""
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from app.core.filesystem import FileSystem
from app.core.wikilinks import LINK, active_text, resolve_link

_LOCK = RLock()

class FileActions:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.trash = self.root / '.starview' / 'trash'
        self.trash.resolve().relative_to(self.root)

    def path(self, value):
        relative = Path(value)
        if not value.strip() or relative.is_absolute() or '\\' in value or any(part.startswith('.') for part in relative.parts) or any(char in value for char in '\n\r[]|{}'):
            raise ValueError('Choose a visible file inside the workspace')
        path = self.root / relative
        path.resolve().relative_to(self.root)
        if path.is_symlink():
            raise ValueError('File actions do not follow symbolic links')
        return path

    def move(self, source, target):
        with _LOCK:
            old, new = self.path(source), self.path(target)
            if not old.is_file(): raise FileNotFoundError('File not found')
            if old == new: return {'path': source}
            if old.suffix.lower() != new.suffix.lower(): raise ValueError('Keep the same file extension')
            source, target = old.relative_to(self.root).as_posix(), new.relative_to(self.root).as_posix()
            documents = [p.as_posix() for p in FileSystem(self.root).list_files() if p.suffix.lower() == '.tex' and not any(part.startswith('.') for part in p.parts)]
            changes = {}
            for document in documents:
                file = self.root / document
                content = file.read_text(encoding='utf-8')
                next_source = target if document == source else document
                def rewrite(match):
                    resolved = resolve_link(self.root, document, match.group(1), documents)
                    if resolved is None or (document != source and resolved != source): return match.group(0)
                    next_target = target if resolved == source else resolved
                    link = os.path.relpath(next_target, str(Path(next_source).parent)).replace(os.sep, '/')
                    if not match.group(1).lower().endswith('.tex'): link = link[:-4]
                    return '[[' + link + ('|' + (match.group(2) or match.group(1))) + ']]'
                def tex_reference(match):
                    name=match.group(2)
                    candidates=[name] + [name+ext for ext in ['.tex','.png','.jpg','.jpeg','.pdf','.svg','.eps']]
                    if not any((self.root / candidate).resolve() == old.resolve() for candidate in candidates): return match.group(0)
                    replacement=target if Path(name).suffix else str(Path(target).with_suffix(''))
                    return match.group(1) + replacement + '}'
                updated=''.join(re.sub(r'(\\(?:input|include|includegraphics)(?:\[[^\]]*\])?\s*\{)([^{}]+)\}',tex_reference,LINK.sub(rewrite,segment)) if active else segment for segment,active in active_text(content))
                if updated != content: changes[file] = updated.encode()
            for filename in ['tags.json','links.json','graph.json','nodes.json']:
                file = self.root / '.starview' / filename
                file.resolve().relative_to(self.root)
                if not file.exists(): continue
                value=json.loads(file.read_text())
                if filename=='tags.json' and source in value.get('files',{}): value['files'][target]=value['files'].pop(source)
                if filename in {'links.json','graph.json'}:
                    for edge in value.get('links' if filename=='links.json' else 'edges',[]):
                        for key in ['source','target']:
                            if edge[key]==source: edge[key]=target
                    if source in value.get('node_colors',{}): value['node_colors'][target]=value['node_colors'].pop(source)
                if filename=='nodes.json':
                    for node in value.get('nodes',[]): node['targets']=[target if path==source else path for path in node['targets']]
                changes[file]=(json.dumps(value,indent=2)+'\n').encode()
            backups={file:file.read_bytes() for file in changes}
            new.parent.mkdir(parents=True,exist_ok=True)
            try:
                with new.open('xb') as handle: handle.write(changes.get(old,old.read_bytes()))
            except FileExistsError: raise FileExistsError('A file already exists at that location')
            try:
                for file,content in changes.items():
                    if file != old: file.write_bytes(content)
                old.unlink()
            except Exception:
                for file,content in backups.items(): file.write_bytes(content)
                new.unlink(missing_ok=True)
                raise
            return {'path':target}

    def delete(self, source):
        with _LOCK:
            file=self.path(source)
            if not file.is_file(): raise FileNotFoundError('File not found')
            token=uuid.uuid4().hex
            directory=self.trash/token
            directory.mkdir(parents=True)
            info={'id':token,'path':file.relative_to(self.root).as_posix(),'deleted_at':datetime.now(timezone.utc).isoformat()}
            (directory/'info.json').write_text(json.dumps(info))
            file.rename(directory/'file')
            return info

    def list_trash(self):
        if not self.trash.exists(): return []
        entries=[]
        for directory in self.trash.iterdir():
            if not re.fullmatch(r'[a-f0-9]{32}',directory.name) or directory.is_symlink(): continue
            if (directory/'file').is_file(): entries.append(json.loads((directory/'info.json').read_text()))
        return sorted(entries,key=lambda entry:entry['deleted_at'],reverse=True)

    def restore(self, token):
        with _LOCK:
            if not re.fullmatch(r'[a-f0-9]{32}',token): raise ValueError('Invalid trash item')
            directory=self.trash/token
            directory.resolve().relative_to(self.root)
            info=json.loads((directory/'info.json').read_text())
            target=self.path(info['path'])
            target.parent.mkdir(parents=True,exist_ok=True)
            content=(directory/'file').read_bytes()
            with target.open('xb') as handle: handle.write(content)
            (directory/'file').unlink()
            (directory/'info.json').unlink()
            directory.rmdir()
            return {'path':info['path']}
