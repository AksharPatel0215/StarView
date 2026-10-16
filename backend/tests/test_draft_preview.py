import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from app.api.agent import DraftPreview, preview

class DraftPreviewTests(unittest.TestCase):
    def test_preview_is_isolated_and_cleans_up(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            original=root/'existing.tex';original.write_text('original')
            stages=[]
            def compile(stage,path):
                stages.append(stage)
                self.assertNotEqual(stage,root)
                self.assertEqual((stage/path).read_text(),'draft')
                (stage/'draft.pdf').write_bytes(b'%PDF-test')
                return {'success':True,'pdf':'draft.pdf'}
            with patch('app.api.agent.root',return_value=root),patch('app.core.latex.LatexCompiler.compile',side_effect=compile):
                result=preview('notes',DraftPreview(path='existing.tex',content='draft'))
            self.assertEqual(result.body,b'%PDF-test')
            self.assertEqual(original.read_text(),'original')
            self.assertFalse(stages[0].exists())
            self.assertEqual(list(root.iterdir()),[original])
    def test_failed_compilation_is_reported_and_paths_are_validated(self):
        with tempfile.TemporaryDirectory() as directory,patch('app.api.agent.root',return_value=Path(directory)):
            for path in ['../escape.tex','/tmp/escape.tex','file.txt']:
                with self.assertRaises(HTTPException) as error:preview('notes',DraftPreview(path=path,content='draft'))
                self.assertEqual(error.exception.status_code,400)
            with patch('app.core.latex.LatexCompiler.compile',return_value={'success':False,'stdout':'Invalid LaTeX'}):
                with self.assertRaises(HTTPException) as error:preview('notes',DraftPreview(content='broken'))
                self.assertEqual(error.exception.status_code,422)
