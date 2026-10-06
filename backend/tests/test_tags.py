import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from support import TestClient
from app.main import app
from app.core.tags import FileTags
from app.core.folder_picker import choose_folder

class TagTests(unittest.TestCase):
    def test_defaults_persistence_and_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'chapters').mkdir()
            (root / 'chapters' / 'intro.tex').write_text('hello')
            (root / 'main.tex').write_text('hello')
            tags = FileTags(root)
            self.assertEqual(tags.all()['main.tex']['folder'], root.name)
            self.assertEqual(tags.all()['chapters/intro.tex']['folder'], 'chapters')
            tags.update('chapters/intro.tex', [' topic ', 'topic', 'draft'])
            self.assertEqual(FileTags(root).all()['chapters/intro.tex']['custom'], ['topic', 'draft'])
            with self.assertRaises(ValueError): tags.update('../outside.tex', ['bad'])
            with self.assertRaises(FileNotFoundError): tags.update('missing.tex', ['bad'])
            with self.assertRaises(ValueError): tags.update('main.tex', ['x' * 61])
            tags.update('chapters/intro.tex', [])
            self.assertEqual(tags.all()['chapters/intro.tex']['folder'], 'chapters')

    def test_picker_selection_and_cancellation(self):
        with TestClient(app) as client:
            with patch('app.api.projects.choose_folder', return_value='/tmp/example'):
                self.assertEqual(client.post('/api/projects/choose-folder').json(), {'path': '/tmp/example'})
            with patch('app.api.projects.choose_folder', return_value=None):
                self.assertEqual(client.post('/api/projects/choose-folder').json(), {'path': None})
            with patch('app.api.projects.choose_folder', side_effect=RuntimeError('Unavailable')):
                self.assertEqual(client.post('/api/projects/choose-folder').status_code, 503)

    def test_picker_subprocess(self):
        with patch('app.core.folder_picker.subprocess.run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = '/tmp/project\n'
            self.assertEqual(choose_folder(), '/tmp/project')
            self.assertNotIn('shell', run.call_args.kwargs)
