import tempfile
import unittest
from pathlib import Path
from app.core.retrieval import NoteRetrieval

class RetrievalCoverageTests(unittest.TestCase):
    def test_named_topic_beats_current_application_note(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'modulus.tex').write_text('\\documentclass{article}\n\\title{Modulus and Distance}\n\\begin{document}\nThe modulus is the distance from zero.\n\\end{document}')
            (root/'derivative.tex').write_text('\\documentclass{article}\n\\title{Geometric derivative}\n\\begin{document}\n'+('The modulus scales the derivative. Important uses and ways.\n'*100)+'\\end{document}')
            hits=NoteRetrieval(root).search('What are all the ways the modulus is used and important',12,'derivative.tex')
            self.assertEqual(hits[0]['path'],'modulus.tex')
            self.assertEqual(len({h['path'] for h in hits[:2]}),2)

    def test_overview_covers_distinct_documents_before_duplicate_passages(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for i in range(9):
                (root/f'application-{i}.tex').write_text('\\documentclass{article}\n\\begin{document}\n'+('The modulus controls distance and convergence.\n'*80)+'\\end{document}')
            hits=NoteRetrieval(root).search('All uses of modulus',12)
            self.assertEqual(len({h['path'] for h in hits[:9]}),9)

    def test_unrelated_open_note_is_not_retrieved_just_because_it_is_open(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'unrelated.tex').write_text('\\documentclass{article}\n\\begin{document}\nBanach spaces.\n\\end{document}')
            self.assertEqual(NoteRetrieval(root).search('modulus',12,'unrelated.tex'),[])
