import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
from app.core.retrieval import NoteRetrieval
from app.core.evidence import evidence_passages,locate_quote
from app.core.grounded_rag import grounded_claims,verify_claims,explain
from app.core.hybrid_retrieval import hybrid_candidates

class GroundedRagTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.source='\n'.join([r'\documentclass{article}',r'\begin{document}',r'\maketitle',r'\section{Roots}',r'For nonzero $z$, its nth roots have arguments $(\theta+2\pi k)/n$.',r'\begin{tikzpicture}',r'\draw (0,0)--(1,1);',r'\end{tikzpicture}',r'\section{Open sets}',r'An open set contains a small disk about every one of its points.',r'\section*{Connections}',r'[[other|Rouche and argument principle]]',r'\end{document}'])
        (self.root/'roots.tex').write_text(self.source)
        self.retrieval=NoteRetrieval(self.root)
    def tearDown(self):self.temp.cleanup()
    def test_clean_passages_retain_late_sections_and_real_line_numbers(self):
        passages=evidence_passages(self.retrieval);text=' '.join(p['excerpt'] for p in passages)
        self.assertIn('An open set',text);self.assertNotIn('maketitle',text);self.assertNotIn('tikzpicture',text);self.assertNotIn('Rouche',text)
        p=next(p for p in passages if 'An open set' in p['excerpt'])
        quote=locate_quote(self.retrieval,p,'An open set contains a small disk')
        self.assertEqual(quote['line_start'],10)
        self.assertIsNone(locate_quote(self.retrieval,p,'Invented source quotation'))
    def test_changed_note_has_new_passage_ids_and_old_quote_cannot_be_cited(self):
        old=evidence_passages(self.retrieval)
        (self.root/'roots.tex').write_text(self.source.replace('An open set contains a small disk','A domain is an open connected set'))
        current=evidence_passages(self.retrieval)
        self.assertNotEqual([p['id'] for p in old],[p['id'] for p in current])
        p=next(p for p in old if 'An open set' in p['excerpt'])
        self.assertIsNone(locate_quote(self.retrieval,p,'An open set contains a small disk'))
    def test_fabricated_or_out_of_passage_quotes_are_not_accepted(self):
        p=evidence_passages(self.retrieval)[0]
        claims=[{'text':'Rouche counts all roots.','kind':'inference','evidence':[{'id':p['id'],'quote':'Rouche counts all roots.'}]}]
        self.assertEqual(grounded_claims(self.retrieval,[p],claims),[])
    def test_unsupported_or_missing_verifier_verdicts_are_withheld(self):
        claims=[{'text':'A fabricated bridge','kind':'inference','evidence':[]}]
        for verdicts in [[],[{'index':0,'status':'unsupported','reason':'Not in evidence'}],[{'index':0,'status':'uncertain','reason':'Insufficient'}]]:
            with patch('app.core.grounded_rag.structured',AsyncMock(return_value={'status':verdicts[0]['status']} if verdicts else {})):
                self.assertEqual(asyncio.run(verify_claims(claims,'test','')),[])
    def test_hop_requires_substantive_evidence_from_both_endpoints(self):
        p=evidence_passages(self.retrieval)[0]
        generation={'claims':[{'text':'The formula gives root angles.','kind':'stated','evidence':[{'id':p['id'],'quote':r'its nth roots have arguments $(\theta+2\pi k)/n$.'}]}]}
        with patch('app.core.grounded_rag.structured',AsyncMock(side_effect=[generation,{'status':'supported','reason':'Valid'},{'status':'supported','reason':'Valid'}])):
            self.assertEqual(asyncio.run(explain(self.retrieval,'connection',[p],'test','',('roots.tex','other.tex'))),[])
    def test_semantics_and_exact_terms_both_contribute_candidates(self):
        docs=[{'id':'a','path':'magnitude.tex','title':'Magnitude','excerpt':'Distance from the origin.'},{'id':'b','path':'modulus.tex','title':'Modulus','excerpt':'A precise definition.'},{'id':'c','path':'other.tex','title':'Other','excerpt':'Unrelated.'}]
        with patch('app.core.hybrid_retrieval.embed',AsyncMock(return_value=[[1.,0.],[0.,1.],[-1.,0.],[1.,0.]])):
            result=asyncio.run(hybrid_candidates('modulus',docs,2))
        self.assertEqual({p['id'] for p in result},{'a','b'})

    def test_embedding_cache_reuses_identical_text_but_reembeds_edits(self):
        import httpx
        from app.core.hybrid_retrieval import embed
        response=httpx.Response(200,json={'embeddings':[[1.,0.]]},request=httpx.Request('POST','http://example.test'))
        with patch.dict('os.environ',{'STARVIEW_DATA_DIR':str(self.root/'cache')}),patch('httpx.AsyncClient.post',AsyncMock(return_value=response)) as post:
            asyncio.run(embed(['original passage']));asyncio.run(embed(['original passage']));self.assertEqual(post.call_count,1)
            asyncio.run(embed(['edited passage']));self.assertEqual(post.call_count,2)

    def test_explanation_cache_key_changes_with_evidence_and_model(self):
        from app.core.grounded_rag import explanation_cache_key
        a=explanation_cache_key('question',[{'id':'old'}],'model-a','',None)
        b=explanation_cache_key('question',[{'id':'edited'}],'model-a','',None)
        c=explanation_cache_key('question',[{'id':'old'}],'model-b','',None)
        self.assertNotEqual(a,b);self.assertNotEqual(a,c)

    def test_rejected_bridge_shows_real_evidence_without_claiming_connection(self):
        from app.core.grounded_rag import source_comparison
        text=source_comparison(self.retrieval,evidence_passages(self.retrieval),['roots.tex'],{'roots.tex':'Roots'})
        self.assertIn('From your notes:',text)
        self.assertNotIn('Path:',text)
        self.assertNotIn('Evidence from the linked notes',text)
        self.assertIn('For nonzero',text)
        self.assertIn('[roots.tex:5]',text)
        self.assertNotIn('maketitle',text)

    def test_connection_fallback_prefers_substantive_bridge_excerpt(self):
        from app.core.grounded_rag import source_comparison
        text=r"While Newton's method requires the derivative, the secant method approximates it using the two most recent iterates."
        (self.root/'secant.tex').write_text('\\documentclass{article}\n\\begin{document}\n'+text+'\n\\end{document}')
        retrieval=NoteRetrieval(self.root)
        result=source_comparison(retrieval,evidence_passages(retrieval),['roots.tex','secant.tex'],{'roots.tex':"Newton's Method",'secant.tex':'Secant Method'})
        self.assertIn(text,result)
        self.assertNotIn('For nonzero',result)
        self.assertNotIn('Connection explanation not verified',result)
