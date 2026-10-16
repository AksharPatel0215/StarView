import asyncio
import json
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from app.core.agent_review import ReviewStore
from app.core.retrieval import NoteRetrieval
from app.core.knowledge import KnowledgeGraph
from app.mcp_server import dispatch
from app.services.note_agent import ask

TEX='\\documentclass{article}\n\\title{%s}\n\\begin{document}\n%s\n\\end{document}\n'
class AgentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'Limits').mkdir()
        (self.root/'Limits/cr.tex').write_text(TEX%('Cauchy Riemann','Continuous partial derivatives and Cauchy Riemann equations imply complex differentiability.'))
        (self.root/'geometry.tex').write_text(TEX%('Geometry','The complex derivative scales and rotates tangent vectors.'))
        KnowledgeGraph(self.root).connect('Limits/cr.tex','geometry.tex')
        self.store=ReviewStore(self.root)
    def tearDown(self): self.temp.cleanup()
    def create(self): return {'kind':'create_note','path':'Limits/new.tex','content':TEX%('New','A draft.'),'reason':'New note'}
    def test_retrieval_passages_graph_and_fresh_files(self):
        hits=NoteRetrieval(self.root).search('Cauchy Riemann')
        self.assertEqual(hits[0]['path'],'Limits/cr.tex');self.assertGreater(hits[0]['line_start'],0)
        self.assertTrue(any(h['path']=='geometry.tex' for h in hits))
        (self.root/'Limits/cr.tex').write_text(TEX%('Changed','Banach fixed point theorem'))
        self.assertIn('Banach',NoteRetrieval(self.root).search('Banach')[0]['excerpt'])
    def test_stage_does_not_mutate_and_editable_approval_applies_once(self):
        p=self.store.stage([self.create()]);self.assertFalse((self.root/'Limits/new.tex').exists())
        p['changes'][0]['content']=TEX%('Reviewed','Verified by human')
        self.store.apply(p['id'],p['changes'])
        self.assertIn('Verified by human',(self.root/'Limits/new.tex').read_text())
        self.assertEqual(self.store.pending(),[])
        with self.assertRaises(ValueError): self.store.apply(p['id'])
    def test_conflict_prevents_any_partial_application(self):
        p=self.store.stage([self.create(),{'kind':'update_note','path':'geometry.tex','content':TEX%('G','Updated')}])
        (self.root/'geometry.tex').write_text('Human new edit')
        with self.assertRaises(ValueError): self.store.apply(p['id'])
        self.assertFalse((self.root/'Limits/new.tex').exists());self.assertEqual((self.root/'geometry.tex').read_text(),'Human new edit')
    def test_new_notes_and_labeled_connections_approved_together(self):
        p=self.store.stage([{'kind':'connect','source':'Limits/new.tex','target':'geometry.tex','labels':['explains']},self.create()])
        self.store.apply(p['id'])
        edge=next(e for e in KnowledgeGraph(self.root).graph()['links'] if e['source']=='Limits/new.tex')
        self.assertEqual(edge['labels'],['explains'])
    def test_rollback_when_late_metadata_operation_fails(self):
        p=self.store.stage([self.create(),{'kind':'connect','source':'Limits/new.tex','target':'geometry.tex'}])
        before=(self.root/'.starview/links.json').read_bytes()
        with patch.object(KnowledgeGraph,'connect',side_effect=OSError('disk full')):
            with self.assertRaises(OSError): self.store.apply(p['id'])
        self.assertFalse((self.root/'Limits/new.tex').exists());self.assertEqual((self.root/'.starview/links.json').read_bytes(),before)
        self.assertEqual(self.store.get(p['id'])['status'],'pending')
    def test_reject_does_not_change_notes(self):
        p=self.store.stage([self.create()]);self.store.reject(p['id']);self.assertFalse((self.root/'Limits/new.tex').exists())
        with self.assertRaises(ValueError): self.store.apply(p['id'])
    def test_paths_and_existing_files_are_protected(self):
        for path in ['../evil.tex','/tmp/evil.tex','.starview/evil.tex','note.md','geometry.tex']:
            with self.subTest(path=path):
                with self.assertRaises(ValueError):self.store.stage([{**self.create(),'path':path}])
    def test_symlink_and_approval_target_substitution_blocked(self):
        (self.root/'sym.tex').symlink_to(self.root/'geometry.tex')
        with self.assertRaises(ValueError):self.store.stage([{'kind':'update_note','path':'sym.tex','content':'New'}])
        p=self.store.stage([self.create()]);p['changes'][0]['path']='other.tex'
        with self.assertRaises(ValueError):self.store.apply(p['id'],p['changes'])
    def test_missing_endpoint_and_inline_disconnect_rejected(self):
        with self.assertRaises(ValueError):self.store.stage([{'kind':'connect','source':'missing.tex','target':'geometry.tex'}])
        (self.root/'geometry.tex').write_text(TEX%('Geometry','[[Limits/cr.tex]]'))
        with self.assertRaises(ValueError):self.store.stage([{'kind':'disconnect','source':'geometry.tex','target':'Limits/cr.tex'}])
    def test_graph_change_invalidates_connection_proposal(self):
        p=self.store.stage([{'kind':'label_connection','source':'Limits/cr.tex','target':'geometry.tex','labels':['prerequisite']}])
        KnowledgeGraph(self.root).disconnect('Limits/cr.tex','geometry.tex')
        with self.assertRaises(ValueError):self.store.apply(p['id'])
    def test_mcp_initialize_read_search_stage_and_no_apply_tool(self):
        response=dispatch(self.root,{'id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18'}})
        self.assertEqual(response['result']['protocolVersion'],'2025-06-18')
        tools=dispatch(self.root,{'id':2,'method':'tools/list'})['result']['tools']
        self.assertEqual({t['name'] for t in tools},{'search_notes','read_note','concept_neighbors','propose_changes'})
        self.assertIsNone(dispatch(self.root,{'method':'notifications/initialized'}))
        for name,args in [('search_notes',{'query':'derivative'}),('read_note',{'path':'geometry.tex'}),('concept_neighbors',{'path':'geometry.tex'}),('propose_changes',{'changes':[self.create()]})]:
            response=dispatch(self.root,{'id':3,'method':'tools/call','params':{'name':name,'arguments':args}})
            self.assertFalse(response['result']['isError'])
        self.assertFalse((self.root/'Limits/new.tex').exists())
        self.assertTrue(dispatch(self.root,{'id':4,'method':'tools/call','params':{'name':'apply_changes','arguments':{}}})['result']['isError'])
    def test_model_errors_never_write_notes(self):
        status={'available':True,'models':['test-model'],'default_model':'test-model'}
        response=AsyncMock();response.json=lambda:{'message':{'content':'not JSON'}};response.raise_for_status=lambda:None
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',AsyncMock(return_value=response)):
            with self.assertRaises(RuntimeError):asyncio.run(ask(self.root,'Create notes'))
        self.assertFalse((self.root/'Limits/new.tex').exists())
    def test_agent_citations_filtered_and_drafts_wait_for_human(self):
        status={'available':True,'models':['test-model'],'default_model':'test-model'}
        response=AsyncMock();response.json=lambda:{'message':{'content':json.dumps({'answer':'Draft for review','citations':['geometry.tex','geometry.tex','fabricated.tex'],'changes':[self.create()]})}};response.raise_for_status=lambda:None
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',AsyncMock(return_value=response)):
            result=asyncio.run(ask(self.root,'Propose a note about complex derivative geometry'))
        self.assertEqual(result['citations'],['geometry.tex']);self.assertEqual(result['proposal']['status'],'pending');self.assertFalse((self.root/'Limits/new.tex').exists())

    def test_mcp_stdio_round_trip(self):
        messages=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18'}},{'jsonrpc':'2.0','method':'notifications/initialized'},{'jsonrpc':'2.0','id':2,'method':'tools/list'},{'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'search_notes','arguments':{'query':'Cauchy Riemann'}}}]
        process=subprocess.run([sys.executable,str(Path(__file__).resolve().parents[1]/'starview_mcp.py'),'--workspace',str(self.root)],input=''.join(json.dumps(m)+'\n' for m in messages),text=True,capture_output=True,timeout=15)
        self.assertEqual(process.returncode,0,process.stderr)
        replies=[json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual([r['id'] for r in replies],[1,2,3])
        self.assertEqual(len(replies[1]['result']['tools']),4)
        self.assertIn('Limits/cr.tex',replies[2]['result']['content'][0]['text'])
    def test_generated_fragment_gets_complete_reviewable_template(self):
        from app.services.note_agent import standalone_note
        fragment='\\section{Definition}\nA local linear map.'
        result=standalone_note(fragment)
        self.assertIn('\\documentclass',result);self.assertIn('\\begin{document}',result);self.assertIn(fragment,result);self.assertIn('\\end{document}',result)
        original=TEX%('Good','Already complete')
        self.assertEqual(standalone_note(original),original.strip())
        self.assertIn('\\begin{document}',standalone_note('\x08egin{document}Test\\end{document}'))

    def test_mandatory_note_response_becomes_reviewable_source_and_connection(self):
        status={'available':True,'models':['test-model'],'default_model':'test-model'}
        data={'answer':'Draft ready','citations':['geometry.tex'],'note':{'path':'Limits/new.tex','content':'A reviewed definition.','reason':'New note'},'changes':[{'kind':'connect','source':'Limits/new.tex','target':'geometry.tex','labels':['explains']}]}
        response=AsyncMock();response.json=lambda:{'message':{'content':json.dumps(data)}};response.raise_for_status=lambda:None
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',AsyncMock(return_value=response)):
            result=asyncio.run(ask(self.root,'Create Limits/new.tex and connect Limits/new.tex to geometry.tex'))
        self.assertEqual([c['kind'] for c in result['proposal']['changes']],['create_note','connect'])
        self.assertIn('\\begin{document}',result['proposal']['changes'][0]['content'])
        self.assertFalse((self.root/'Limits/new.tex').exists())

    def test_explanation_request_cannot_stage_unsolicited_edits(self):
        status={'available':True,'models':['test-model'],'default_model':'test-model'}
        data={'answer':'Explanation','citations':['geometry.tex'],'changes':[self.create()]}
        response=AsyncMock();response.json=lambda:{'message':{'content':json.dumps(data)}};response.raise_for_status=lambda:None
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',AsyncMock(return_value=response)):
            result=asyncio.run(ask(self.root,'Explain the complex derivative. No changes.'))
        self.assertIsNone(result['proposal']);self.assertEqual(self.store.pending(),[])

    def test_modifying_connections_does_not_require_a_note_rewrite(self):
        status={'available':True,'models':['test-model'],'default_model':'test-model'}
        data={'answer':'Proposed label','citations':['geometry.tex'],'changes':[{'kind':'label_connection','source':'Limits/cr.tex','target':'geometry.tex','labels':['explains']}]}
        response=AsyncMock();response.json=lambda:{'message':{'content':json.dumps(data)}};response.raise_for_status=lambda:None
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',AsyncMock(return_value=response)):
            result=asyncio.run(ask(self.root,'Modify the connection from Limits/cr.tex to geometry.tex to use the label explains'))
        self.assertEqual(result['proposal']['changes'][0]['kind'],'label_connection')

    def test_quick_answers_have_small_schema_and_cannot_stage_changes(self):
        status={'available':True,'models':['deepseek-r1:7b'],'default_model':'auto','fast_model':'deepseek-r1:7b','draft_model':'deepseek-r1:7b'}
        response=AsyncMock();response.status_code=200;response.json=lambda:{'response':json.dumps({'answer':'A complex derivative is a direction-independent limit.','citations':['geometry.tex'],'changes':[self.create()]}),'prompt_eval_count':120,'eval_count':30};response.raise_for_status=lambda:None
        post=AsyncMock(return_value=response)
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',post):
            result=asyncio.run(ask(self.root,'What is a complex derivative? No changes.','auto'))
        self.assertTrue(post.call_args.args[0].endswith('/api/generate'))
        payload=post.call_args.kwargs['json']
        self.assertTrue(payload['raw']);self.assertEqual(payload['options']['num_ctx'],4096)
        self.assertEqual(set(payload['format']['properties']),{'answer','citations'})
        self.assertNotIn('note_catalog',payload['prompt']);self.assertNotIn('label_connection',payload['prompt'])
        self.assertIsNone(result['proposal']);self.assertEqual(self.store.pending(),[])
        self.assertEqual(result['timing']['prompt_tokens'],120)

    def test_followups_retrieve_using_the_latest_exchange(self):
        status={'available':True,'models':['test-model'],'default_model':'test-model'}
        response=AsyncMock();response.status_code=200;response.json=lambda:{'message':{'content':json.dumps({'answer':'The derivative measures local scaling and rotation.','citations':['geometry.tex']})}};response.raise_for_status=lambda:None
        history=[{'role':'user','content':'What are nth roots?'},{'role':'assistant','content':'Roots form a polygon.'},{'role':'user','content':'How do I take a complex derivative?'},{'role':'assistant','content':r"f'(z)=u_x+iv_x"}]
        post=AsyncMock(return_value=response)
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',post),patch('app.services.note_agent.NoteRetrieval.search',return_value=[]) as search:
            asyncio.run(ask(self.root,'Can you elaborate further what that equation means?',history=history))
        query=search.call_args.args[0]
        self.assertIn('complex derivative',query);self.assertNotIn('nth roots',query)
        latest=json.loads(post.call_args.kwargs['json']['messages'][-1]['content'])['immediately_preceding_exchange']
        self.assertEqual(latest,history[-2:])

    def test_new_note_connections_use_created_note_and_are_visible_in_source(self):
        status={'available':True,'models':['test-model'],'default_model':'test-model'}
        data={'answer':'Draft','citations':['geometry.tex'],'note':{'path':'Limits/newton.tex','content':TEX%('Newton method','A complex derivative iteration.'),'reason':'Root finding'},'changes':[{'kind':'connect','source':'Limits/cr.tex','target':'geometry.tex','labels':['related'],'reason':'Wrong existing pair'},{'kind':'connect','source':'Limits/newton.tex','target':'geometry.tex','labels':['prerequisite'],'reason':'Derivative geometry explains the local iteration.'}]}
        response=AsyncMock();response.status_code=200;response.json=lambda:{'message':{'content':json.dumps(data)}};response.raise_for_status=lambda:None
        post=AsyncMock(return_value=response)
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',post):
            result=asyncio.run(ask(self.root,'Draft a note about Newton method in Limits/newton.tex and connect it'))
        changes=result['proposal']['changes']
        edges=[c for c in changes if c['kind']=='connect']
        self.assertTrue(edges);self.assertTrue(all(c['source']=='Limits/newton.tex' for c in edges))
        self.assertIn('[[geometry|Geometry]]',changes[0]['content'])
        self.assertFalse((self.root/'Limits/newton.tex').exists())
        payload=post.call_args.kwargs['json']
        context=json.loads(payload['messages'][-1]['content'])['retrieved_context']
        self.assertIn('style_example',context)

    def test_proofs_retain_reasoning_and_full_output_budget(self):
        status={'available':True,'models':['deepseek-r1:7b'],'default_model':'auto','fast_model':'deepseek-r1:7b','draft_model':'deepseek-r1:7b'}
        response=AsyncMock();response.status_code=200;response.json=lambda:{'message':{'content':json.dumps({'answer':'Proof from the notes.','citations':['geometry.tex']})}};response.raise_for_status=lambda:None
        post=AsyncMock(return_value=response)
        with patch('app.services.note_agent.ollama_status',AsyncMock(return_value=status)),patch('httpx.AsyncClient.post',post):
            result=asyncio.run(ask(self.root,'Prove the Cauchy Riemann necessary conditions. No changes.','auto'))
        self.assertTrue(post.call_args.args[0].endswith('/api/chat'))
        payload=post.call_args.kwargs['json']
        self.assertNotIn('think',payload);self.assertEqual(payload['options']['num_predict'],3500)
        self.assertIsNone(result['proposal'])

    def test_retrieval_skips_preamble_and_prioritizes_defining_heading(self):
        content='\n'.join(['\\documentclass{article}']+['% Complex derivative setup']*65+['\\begin{document}','\\section{Complex derivative}','A complex derivative is a limit independent of direction.','\\end{document}'])
        (self.root/'definition.tex').write_text(content)
        hits=NoteRetrieval(self.root).search('complex derivative')
        self.assertEqual(hits[0]['path'],'definition.tex')
        self.assertNotIn('setup',hits[0]['excerpt']);self.assertGreater(hits[0]['line_start'],65)
