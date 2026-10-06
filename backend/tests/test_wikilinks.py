import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from subprocess import CompletedProcess
from app.core.wikilinks import find_links, resolve_link, transform
from app.core.knowledge import KnowledgeGraph
from app.core.latex import LatexCompiler

class WikiLinkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        (self.root / 'main.tex').write_text(r'\documentclass{article}\begin{document}See [[research|research notes]].\end{document}')
        (self.root / 'research.tex').write_text(r'\documentclass{article}\title{Research}\begin{document}Hello\end{document}')
        self.documents = ['main.tex', 'research.tex', 'chapters/topic.tex']
    def tearDown(self):
        self.temp.cleanup()
    def test_resolve_paths_and_reject_escape(self):
        self.assertEqual(resolve_link(self.root, 'main.tex', 'research', self.documents), 'research.tex')
        self.assertEqual(resolve_link(self.root, 'chapters/topic.tex', '../research', self.documents), 'research.tex')
        self.assertIsNone(resolve_link(self.root, 'main.tex', '../outside', self.documents))
        self.assertIsNone(resolve_link(self.root, 'main.tex', '/research', self.documents))
        self.assertIsNone(resolve_link(self.root, 'main.tex', 'research', ['a/research.tex', 'b/research.tex']))
    def test_alias_transform_and_special_characters(self):
        result = transform(self.root, 'main.tex', '[[research|R & D]] [[missing|Unknown]]', self.documents)
        self.assertIn(r'\href{https://starview.invalid/open/research.tex}{R \& D}', result)
        self.assertTrue(result.endswith(' Unknown'))
    def test_comments_and_literal_blocks_do_not_create_links(self):
        content = '\\verb|[[literal]]| % [[ignored]]\n\\begin{verbatim}\n[[ignored]]\n\\end{verbatim}\n[[research]]'
        self.assertEqual(len(find_links(content)), 1)
        transformed = transform(self.root, 'main.tex', content, self.documents)
        self.assertEqual(transformed.count('[[ignored]]'), 2)
        self.assertIn(r'\verb|[[literal]]|', transformed)
    def test_graph_derives_backlinks_from_source(self):
        graph = KnowledgeGraph(self.root).graph()
        self.assertEqual(graph['links'], [{'source':'main.tex','target':'research.tex','missing':False,'kind':'inline'}])
        self.assertFalse((self.root / '.starview/links.json').exists())
    def test_build_copy_preserves_original_and_adds_pdf_hyperlink(self):
        original = (self.root / 'main.tex').read_text()
        def run(arguments, **options):
            stage = options['cwd']
            self.assertNotEqual(stage, self.root)
            transformed = (stage / 'main.tex').read_text()
            self.assertIn(r'\usepackage{hyperref}', transformed)
            self.assertIn(r'\href{https://starview.invalid/open/research.tex}{research notes}', transformed)
            build = Path(next(item.split('=',1)[1] for item in arguments if item.startswith('-outdir=')))
            (build / 'main.pdf').write_bytes(b'%PDF')
            return CompletedProcess(arguments, 0, '', '')
        with patch('app.core.latex.shutil.which', return_value='latexmk'), patch('app.core.latex.subprocess.run', side_effect=run):
            result = LatexCompiler().compile(self.root, 'main.tex')
        self.assertTrue(result['success'])
        self.assertEqual((self.root / 'main.tex').read_text(), original)
        self.assertFalse(list((self.root / '.starview/build/main').glob('sources-*')))

if __name__ == '__main__':
    unittest.main()
