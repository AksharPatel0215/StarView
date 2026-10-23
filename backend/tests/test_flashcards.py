import tempfile
import unittest
from pathlib import Path
from app.core.nodes import WorkspaceNodes
from app.core.knowledge import KnowledgeGraph
from app.main import app
from app.models import Project
from app.api.projects import project_manager
from support import TestClient

class FlashcardTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  (self.root/'derivative.tex').write_text(r'\documentclass{article}\title{Derivative}\begin{document}A limit\end{document}')
  project_manager.add_project(Project(name='Flashcard test',root=self.root));self.client=TestClient(app)
 def tearDown(self):self.client.close();self.temp.cleanup()
 def test_create_edit_delete_restore_cards_and_graph(self):
  response=self.client.post('/api/projects/Flashcard%20test/workspace/nodes',json={'kind':'flashcards','title':'Definitions','targets':['derivative.tex']})
  self.assertEqual(response.status_code,200);node=response.json();url='/api/projects/Flashcard%20test/workspace/flashcards'
  card={'id':'test-card','kind':'definition','front':'Derivative?','back':r'\(f\prime(z)\) is a limit.'}
  for cards in [[card],[{**card,'kind':'problem','front':'Differentiate z squared','back':'2z'}],[],[card]]:
   response=self.client.put(url,json={'id':node['id'],'cards':cards});self.assertEqual(response.status_code,200)
   self.assertEqual(WorkspaceNodes(self.root).get(node['id'])['cards'],cards)
  self.client.put('/api/projects/Flashcard%20test/workspace/nodes',json={'id':node['id'],'title':'Renamed','targets':['derivative.tex']})
  self.assertEqual(WorkspaceNodes(self.root).get(node['id'])['cards'],[card])
  graph=KnowledgeGraph(self.root).graph()
  self.assertTrue(any(n.get('kind')=='flashcards' for n in graph['documents']))
  self.assertTrue(any(e['source']==node['id'] and e['target']=='derivative.tex' for e in graph['links']))
 def test_invalid_card_does_not_replace_saved_cards(self):
  store=WorkspaceNodes(self.root);node=store.create('flashcards','Cards',[])
  good={'id':'one','kind':'definition','front':'Term','back':'Meaning'};store.save_cards(node['id'],[good])
  for cards in [[{**good,'front':' '}],[good,good],[{**good,'kind':'invalid'}]]:
   with self.assertRaises(ValueError):store.save_cards(node['id'],cards)
   self.assertEqual(store.get(node['id'])['cards'],[good])
 def test_labels_persist_and_invalid_labels_cannot_replace_the_set(self):
  store=WorkspaceNodes(self.root);node=store.create('flashcards','Labeled',[])
  card={'id':'labeled','kind':'definition','front':'Term','back':'Answer','labels':[' Derivatives ','Derivatives','Complex roots']}
  response=self.client.put('/api/projects/Flashcard%20test/workspace/flashcards',json={'id':node['id'],'cards':[card]})
  self.assertEqual(response.status_code,200)
  expected=['Derivatives','Complex roots'];self.assertEqual(store.get(node['id'])['cards'][0]['labels'],expected)
  for labels in [['x'*65],[''],[str(i) for i in range(17)]]:
   response=self.client.put('/api/projects/Flashcard%20test/workspace/flashcards',json={'id':node['id'],'cards':[{**card,'labels':labels}]})
   self.assertIn(response.status_code,[400,422]);self.assertEqual(store.get(node['id'])['cards'][0]['labels'],expected)
