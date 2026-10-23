import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
from app.core.retrieval import NoteRetrieval
from app.core.evidence import evidence_passages
from app.core.grounded_rag import grounded_answer,explain

class ComparisonAnswerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        for name,text in [('newton',"Newton's method uses the derivative at the current iterate."),('secant','The secant method uses the two most recent iterates.'),('bisection','Bisection halves a sign-changing bracket for a continuous real function.')]:
            (self.root/(name+'.tex')).write_text('\\documentclass{article}\n\\title{'+name.title()+' Method}\n\\begin{document}\n'+text+'\n\\end{document}')
        self.retrieval=NoteRetrieval(self.root)
    def tearDown(self):self.tmp.cleanup()
    def test_new_comparison_does_not_retrieve_previous_subject(self):
        async def candidates(query,docs,limit):return docs
        async def answer(retrieval,query,selected,model,key):
            self.assertIn('bisection',query.lower());self.assertNotIn('secant',query.lower())
            self.assertEqual({p['path'] for p in selected},{'newton.tex','bisection.tex'})
            return [{'text':'Newton uses a derivative; bisection halves a bracket.','kind':'stated','evidence':[{'passage_id':p['id'],'path':p['path'],'line_start':p['line_start']} for p in selected]}]
        with patch('app.core.grounded_rag.hybrid_candidates',candidates),patch('app.core.grounded_rag.rerank',AsyncMock(return_value=[])),patch('app.core.grounded_rag.explain',answer):
            result=asyncio.run(grounded_answer(self.retrieval,"What is the difference between Newton's method and the bisection method",'test',history=[{'role':'user','content':'Explain Newton versus secant'}]))
        self.assertIsNone(result['concept_path']);self.assertNotIn('Path:',result['answer'])
        self.assertEqual(set(result['citations']),{'newton.tex','bisection.tex'})
    def test_one_sided_answer_is_withheld(self):
        async def candidates(query,docs,limit):return docs
        p=evidence_passages(self.retrieval)[0]
        claim={'text':'Only one method.','kind':'stated','evidence':[{'passage_id':p['id'],'path':p['path'],'line_start':p['line_start']}]}
        with patch('app.core.grounded_rag.hybrid_candidates',candidates),patch('app.core.grounded_rag.rerank',AsyncMock(return_value=[])),patch('app.core.grounded_rag.explain',AsyncMock(return_value=[claim])):
            result=asyncio.run(grounded_answer(self.retrieval,"Difference between Newton's method and bisection method",'test'))
        self.assertNotIn('Only one method',result['answer'])
    def test_navigation_sections_are_not_evidence(self):
        (self.root/'newton.tex').write_text('\\begin{document}\n\\section{Iteration}\nNewton uses a derivative.\n\\section*{Numerical analysis connections}\n[[secant|Secant method]]; [[bisection|Bisection method]].\n\\end{document}')
        text=' '.join(p['excerpt'] for p in evidence_passages(self.retrieval) if p['path']=='newton.tex')
        self.assertNotIn('connections',text);self.assertNotIn('[[',text)
    def test_system_attaches_current_source_including_formulas(self):
        from app.core.grounded_rag import grounded_claims
        (self.root/'newton.tex').write_text("\\begin{document}\nNewton uses a tangent update.\n\\[\nx_{n+1}=x_n-\\frac{f(x_n)}{f'(x_n)}.\n\\]\n\\end{document}")
        p=next(p for p in evidence_passages(self.retrieval) if p['path']=='newton.tex')
        claim={'text':'Newton uses a tangent update.','kind':'stated','evidence':[{'id':p['id']}]}
        self.assertEqual(grounded_claims(self.retrieval,[p],[claim]),[])
        attached=grounded_claims(self.retrieval,[p],[claim],full_passages=True)
        self.assertIn(r'\frac',attached[0]['evidence'][0]['quote'])
        (self.root/'newton.tex').write_text('Changed source')
        self.assertEqual(grounded_claims(self.retrieval,[p],[claim],full_passages=True),[])
    def test_comparison_generation_requests_developed_answer_and_passage_ids(self):
        passages=evidence_passages(self.retrieval)
        with patch('app.core.grounded_rag.explanation_cache',return_value=None),patch('app.core.grounded_rag.structured',AsyncMock(return_value={'claims':[]})) as model:
            asyncio.run(explain(self.retrieval,"Difference between Newton's method and bisection method",passages,'test',''))
        schema=model.call_args.args[3]
        self.assertEqual(schema['properties']['claims']['minItems'],3)
        refs=schema['properties']['claims']['items']['properties']['evidence']
        self.assertEqual(refs['required'],['left','right'])
        self.assertNotIn('quote',refs['properties'])
