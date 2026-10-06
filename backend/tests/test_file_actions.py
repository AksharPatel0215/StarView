import json
import tempfile
import unittest
from pathlib import Path
from app.core.file_actions import FileActions
from app.core.knowledge import KnowledgeGraph

class FileActionTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.root=Path(self.directory.name);self.actions=FileActions(self.root)
        (self.root/'a.tex').write_text('[[b|Neighbor]]\n% [[b]]\n\\input{b}\n')
        (self.root/'b.tex').write_text('[[a]]\n')
    def tearDown(self): self.directory.cleanup()
    def test_move_rewrites_incoming_outgoing_links_and_metadata(self):
        meta=self.root/'.starview';meta.mkdir()
        (meta/'tags.json').write_text(json.dumps({'version':1,'files':{'a.tex':['example']}}))
        (meta/'nodes.json').write_text(json.dumps({'version':1,'nodes':[{'id':'@node/'+'a'*32,'title':'Hub','kind':'dashboard','targets':['a.tex'],'resource':None}]}))
        self.actions.move('a.tex','Topics/new.tex')
        self.assertEqual((self.root/'Topics/new.tex').read_text(),'[[../b|Neighbor]]\n% [[b]]\n\\input{b}\n')
        self.assertEqual((self.root/'b.tex').read_text(),'[[Topics/new|a]]\n')
        self.assertEqual(json.loads((meta/'tags.json').read_text())['files']['Topics/new.tex'],['example'])
        self.assertEqual(json.loads((meta/'nodes.json').read_text())['nodes'][0]['targets'],['Topics/new.tex'])
        self.assertFalse(any(edge['missing'] for edge in KnowledgeGraph(self.root).graph()['links']))
    def test_move_updates_tex_reference_and_does_not_overwrite(self):
        self.actions.move('b.tex','Notes/other.tex')
        self.assertIn('\\input{Notes/other}',(self.root/'a.tex').read_text())
        with self.assertRaises(FileExistsError):self.actions.move('Notes/other.tex','a.tex')
        self.assertTrue((self.root/'Notes/other.tex').exists())
    def test_trash_and_restore_preserve_file_and_conflict(self):
        data=self.actions.delete('a.tex');self.assertFalse((self.root/'a.tex').exists())
        self.assertEqual(self.actions.list_trash()[0]['path'],'a.tex')
        (self.root/'a.tex').write_text('new file')
        with self.assertRaises(FileExistsError):self.actions.restore(data['id'])
        self.assertEqual((self.root/'a.tex').read_text(),'new file')
        (self.root/'a.tex').unlink();self.actions.restore(data['id'])
        self.assertIn('[[b|Neighbor]]',(self.root/'a.tex').read_text());self.assertEqual(self.actions.list_trash(),[])
    def test_hidden_escape_symlink_and_directory_are_rejected(self):
        for path in ['../x.tex','.starview/a.tex','/tmp/a.tex']:
            with self.assertRaises(ValueError):self.actions.move('a.tex',path)
        with tempfile.TemporaryDirectory() as outside:
            (self.root/'external').symlink_to(outside,target_is_directory=True)
            with self.assertRaises(ValueError):self.actions.move('a.tex','external/a.tex')
        (self.root/'directory').mkdir()
        with self.assertRaises(FileNotFoundError):self.actions.delete('directory')
    def test_assets_update_graphics_references(self):
        (self.root/'picture.png').write_bytes(b'png')
        (self.root/'a.tex').write_text('\\includegraphics[width=4cm]{picture}\n% \\includegraphics{picture}\n')
        self.actions.move('picture.png','Images/plot.png')
        self.assertEqual((self.root/'a.tex').read_text(),'\\includegraphics[width=4cm]{Images/plot}\n% \\includegraphics{picture}\n')
