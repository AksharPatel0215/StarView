import json
import tempfile
import unittest
from pathlib import Path
from app.core.knowledge import KnowledgeGraph

class GraphSemanticsTests(unittest.TestCase):
 def test_hierarchy_and_note_roles_have_meaningful_links(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);(root/'theorem.tex').write_text(r'\title{A theorem}')
   meta=root/'.starview';meta.mkdir()
   ids=['@node/'+c*32 for c in ['a','b','c']]
   nodes=[{'id':ids[0],'kind':'dashboard','title':'Math','level':'root','targets':[ids[1]],'resource':None},{'id':ids[1],'kind':'dashboard','title':'Analysis','level':'topic','targets':[ids[2]],'resource':None},{'id':ids[2],'kind':'dashboard','title':'Fixed points','level':'section','roles':{'theorem.tex':'theorem'},'targets':['theorem.tex'],'resource':None}]
   (meta/'nodes.json').write_text(json.dumps({'version':1,'nodes':nodes}))
   graph=KnowledgeGraph(root).graph();links={(e['source'],e['target']):e['labels'] for e in graph['links']}
   self.assertEqual(links[(ids[0],ids[1])],['contains topic'])
   self.assertEqual(links[(ids[1],ids[2])],['contains section'])
   self.assertEqual(links[(ids[2],'theorem.tex')],['states'])
   docs={d['path']:d for d in graph['documents']}
   self.assertIn('graph-role:topic',docs[ids[1]]['tags'])
   self.assertIn('graph-role:section',docs[ids[2]]['tags'])
