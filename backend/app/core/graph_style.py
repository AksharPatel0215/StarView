"""Project-local presentation metadata for existing document nodes and edges."""
import json
import os
import tempfile
from pathlib import Path
from threading import RLock

PALETTE = {'#b8a1f2', '#82b4e8', '#76c7b2', '#e3b979', '#df98b5', '#a5bd7d', '#c8a183', '#98a3c2'}
_LOCK = RLock()


def clean_labels(labels):
    if not isinstance(labels, list) or any(not isinstance(label, str) for label in labels):
        raise ValueError('Relationship labels must be a list of strings')
    values = list(dict.fromkeys(label.strip() for label in labels if label.strip()))
    if len(values) > 12 or any(len(value) > 60 for value in values):
        raise ValueError('Use up to 12 relationship labels, each at most 60 characters')
    return values


class GraphStyle:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.store = self.root / '.starview' / 'graph.json'
        self.store.resolve().relative_to(self.root)

    def read(self):
        if not self.store.exists():
            return {'version': 1, 'edges': [], 'tag_colors': {}, 'relationship_colors': {}, 'node_colors': {}}
        data = json.loads(self.store.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('edges'), list):
            raise ValueError('Invalid StarView graph settings file')
        for edge in data['edges']:
            if not isinstance(edge, dict) or not all(isinstance(edge.get(key), str) for key in ('source', 'target')):
                raise ValueError('Invalid StarView relationship settings')
            clean_labels(edge.get('labels', []))
            if edge.get('color') is not None and (not isinstance(edge['color'], str) or edge['color'] not in PALETTE):
                raise ValueError('Choose a color from the workspace palette')
        for kind in ('tag_colors', 'relationship_colors', 'node_colors'):
            colors = data.setdefault(kind, {})
            if not isinstance(colors, dict) or any(not isinstance(key, str) or (not isinstance(color, str) or color not in PALETTE) for key, color in colors.items()):
                raise ValueError('Invalid StarView graph colors')
        return data

    def _write(self, data):
        self.store.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.store.parent, delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(data, handle, indent=2)
            handle.write('\n')
        try:
            os.replace(temporary, self.store)
        finally:
            temporary.unlink(missing_ok=True)

    def edge(self, source, target, labels, color=None):
        labels = clean_labels(labels)
        if color is not None and color not in PALETTE:
            raise ValueError('Choose a color from the workspace palette')
        with _LOCK:
            data = self.read()
            data['edges'] = [edge for edge in data['edges'] if (edge['source'], edge['target']) != (source, target)]
            data['edges'].append({'source': source, 'target': target, 'labels': labels, 'color': color})
            self._write(data)

    def color(self, kind, key, color):
        if kind not in ('tag', 'relationship', 'node') or not key.strip() or len(key) > 512:
            raise ValueError('Invalid graph color category')
        if color is not None and color not in PALETTE:
            raise ValueError('Choose a color from the workspace palette')
        bucket = {'tag': 'tag_colors', 'relationship': 'relationship_colors', 'node': 'node_colors'}[kind]
        with _LOCK:
            data = self.read()
            if color is None:
                data[bucket].pop(key, None)
            else:
                data[bucket][key] = color
            self._write(data)
