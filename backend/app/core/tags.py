"""Persistent file labels, with a computed containing-folder label."""
import json
import os
import tempfile
from pathlib import Path
from threading import RLock
from app.core.filesystem import FileSystem

_LOCK = RLock()

class FileTags:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.store = self.root / '.starview' / 'tags.json'
        self.store.resolve().relative_to(self.root)

    def _read(self):
        if not self.store.exists():
            return {}
        data = json.loads(self.store.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('files'), dict):
            raise ValueError('Invalid StarView tags file')
        files = data['files']
        if any(not isinstance(key, str) or not isinstance(values, list) or any(not isinstance(value, str) for value in values) for key, values in files.items()):
            raise ValueError('Invalid StarView tags file')
        return files

    def all(self):
        with _LOCK:
            custom = self._read()
        result = {}
        for path in FileSystem(self.root).list_files():
            folder = path.parent.name if path.parent != Path('.') else self.root.name
            result[path.as_posix()] = {'folder': folder, 'custom': custom.get(path.as_posix(), [])}
        return result

    def update(self, path: str, tags: list[str]):
        file = (self.root / path).resolve()
        relative = file.relative_to(self.root).as_posix()
        if relative not in self.all():
            raise FileNotFoundError('File not found')
        clean = list(dict.fromkeys(tag.strip() for tag in tags if tag.strip()))
        if len(clean) > 30 or any(len(tag) > 60 for tag in clean):
            raise ValueError('Use up to 30 tags, each at most 60 characters')
        with _LOCK:
            data = self._read()
            data[relative] = clean
            self.store.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.store.parent, delete=False) as handle:
                temporary = Path(handle.name)
                json.dump({'version': 1, 'files': data}, handle, indent=2)
            try:
                os.replace(temporary, self.store)
            finally:
                temporary.unlink(missing_ok=True)
        return self.all()
