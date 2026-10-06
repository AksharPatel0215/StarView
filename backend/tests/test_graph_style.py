import tempfile
import unittest
from pathlib import Path
from support import TestClient
from app.api.projects import project_manager
from app.core.knowledge import KnowledgeGraph
from app.main import app

class GraphStyleTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        (self.root / 'main.tex').write_text(r'\documentclass{article} [[example]]')
        (self.root / 'example.tex').write_text(r'\documentclass{article}')
        project_manager.projects.clear()
        self.client = TestClient(app)
        self.client.post('/api/projects', json={'name': 'Graph', 'root': str(self.root)})
        self.url = '/api/projects/Graph'

    def tearDown(self):
        self.client.close()
        project_manager.projects.clear()
        self.directory.cleanup()

    def test_inline_edge_labels_persist_without_rewriting_source(self):
        response = self.client.put(self.url + '/connections/labels', json={'source': 'main.tex', 'target': 'example.tex', 'labels': [' examples ', 'examples', 'references'], 'color': '#76c7b2'})
        self.assertEqual(response.status_code, 200)
        link = response.json()['links'][0]
        self.assertEqual(link['kind'], 'inline')
        self.assertEqual(link['labels'], ['examples', 'references'])
        self.assertEqual(link['color'], '#76c7b2')
        self.assertEqual(KnowledgeGraph(self.root).graph()['links'][0]['labels'], link['labels'])
        self.assertIn('[[example]]', (self.root / 'main.tex').read_text())
        self.assertFalse((self.root / '.starview/links.json').exists())

    def test_colors_persist_and_reset(self):
        for kind, key, bucket in [('tag', 'examples', 'tag_colors'), ('relationship', 'examples', 'relationship_colors'), ('node', 'example.tex', 'node_colors')]:
            data = {'kind': kind, 'key': key, 'color': '#82b4e8'}
            response = self.client.put(self.url + '/graph/colors', json=data)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['styles'][bucket][key], '#82b4e8')
            data['color'] = None
            self.assertNotIn(key, self.client.put(self.url + '/graph/colors', json=data).json()['styles'][bucket])

    def test_reject_invalid_color_missing_edge_and_path_escape(self):
        base = {'source': 'main.tex', 'target': 'example.tex', 'labels': ['examples']}
        self.assertEqual(self.client.put(self.url + '/connections/labels', json={**base, 'color': '#ffffff'}).status_code, 400)
        self.assertEqual(self.client.put(self.url + '/connections/labels', json={**base, 'source': 'example.tex', 'target': 'main.tex'}).status_code, 404)
        self.assertEqual(self.client.put(self.url + '/connections/labels', json={**base, 'source': '../outside.tex'}).status_code, 400)
        self.assertEqual(self.client.put(self.url + '/connections/labels', json={**base, 'labels': ['x' * 61]}).status_code, 400)
        self.assertEqual(self.client.put(self.url + '/graph/colors', json={'kind': 'node', 'key': '../outside.tex', 'color': '#82b4e8'}).status_code, 400)

    def test_corrupt_settings_and_external_symlink_are_not_overwritten(self):
        store = self.root / '.starview/graph.json'
        store.parent.mkdir()
        store.write_text('broken')
        response = self.client.put(self.url + '/graph/colors', json={'kind': 'tag', 'key': 'test', 'color': '#82b4e8'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(store.read_text(), 'broken')
        store.unlink()
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / 'graph.json'; target.write_text('untouched')
            store.symlink_to(target)
            self.assertEqual(self.client.get(self.url + '/connections').status_code, 400)
            self.assertEqual(target.read_text(), 'untouched')
