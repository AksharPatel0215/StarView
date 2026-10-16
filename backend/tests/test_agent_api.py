import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock
from support import TestClient
from app.main import create_app
from app.api.projects import project_manager
from app.models import Project
from app.core.agent_review import ReviewStore

class AgentAPITests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.name='agent-route-test'
  (self.root/'a.tex').write_text('\\documentclass{article}\\title{Derivative}\\begin{document}A derivative scales vectors.\\end{document}')
  project_manager.projects[self.name]=Project(name=self.name,root=self.root)
  self.app=create_app(self.root/'auth');self.client=TestClient(self.app);self.base=f'/api/projects/{self.name}/agent'
 def tearDown(self):project_manager.projects.pop(self.name,None);self.temp.cleanup()
 def test_search_and_approval_require_authentication(self):
  self.assertEqual(self.client.post(self.base+'/search',json={'query':'derivative'}).status_code,200)
  self.client.cookies.clear()
  self.assertEqual(self.client.get('/api/agent/status').status_code,401)
  self.assertEqual(self.client.post(self.base+'/proposals/abc/approve',json={}).status_code,401)
 def test_create_requires_review_and_api_approval_is_single_use(self):
  proposal=ReviewStore(self.root).stage([{'kind':'create_note','path':'new.tex','content':'\\documentclass{article}\\begin{document}A note\\end{document}'}])
  self.assertFalse((self.root/'new.tex').exists());self.assertEqual(len(self.client.get(self.base+'/proposals').json()),1)
  self.assertEqual(self.client.post(self.base+f"/proposals/{proposal['id']}/approve",json={}).status_code,200)
  self.assertTrue((self.root/'new.tex').exists())
  self.assertEqual(self.client.post(self.base+f"/proposals/{proposal['id']}/approve",json={}).status_code,409)
 def test_failed_ollama_returns_actionable_error(self):
  with patch('app.api.agent.ask',AsyncMock(side_effect=RuntimeError('Start Ollama'))):
   response=self.client.post(self.base+'/chat',json={'prompt':'Explain derivatives'})
  self.assertEqual(response.status_code,503);self.assertEqual(response.json()['detail'],'Start Ollama')
 def test_tool_arguments_cannot_select_an_unregistered_workspace(self):
  response=self.client.post('/api/projects/unknown/agent/search',json={'query':'derivative','root':str(self.root)})
  self.assertEqual(response.status_code,404)
 def test_proposal_approval_needs_csrf_and_allowed_origin(self):
  proposal=ReviewStore(self.root).stage([{'kind':'create_note','path':'new.tex','content':'\\documentclass{article}\\begin{document}A note\\end{document}'}])
  url=self.base+f"/proposals/{proposal['id']}/approve"
  self.assertEqual(self.client.post(url,json={},headers={'X-CSRF-Token':''}).status_code,403)
  self.assertEqual(self.client.post(url,json={},headers={'Origin':'https://example.org'}).status_code,403)
  self.assertFalse((self.root/'new.tex').exists())
