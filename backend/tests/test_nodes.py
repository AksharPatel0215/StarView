import tempfile
import unittest
from pathlib import Path
from app.core.nodes import WorkspaceNodes
from app.core.knowledge import KnowledgeGraph
from app.main import app
from support import TestClient
from app.api.projects import project_manager
from app.models import Project

class NodeTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.root=Path(self.directory.name)
        (self.root/'main.tex').write_text(r'\documentclass{article}\title{Main}\begin{document}[[second]]\end{document}')
        (self.root/'second.tex').write_text(r'\title{Second}')
        self.store=WorkspaceNodes(self.root)
        project_manager.add_project(Project(name='Node test',root=self.root))
        self.client=TestClient(app)

    def tearDown(self):
        self.client.close()
        self.directory.cleanup()

    def test_hubs_data_links_persist_in_unified_graph(self):
        data=self.store.create('data','Results',['main.tex'],{'provider':'google','id':'sheet123','name':'Results','kind':'sheet'})
        hub=self.store.create('dashboard','Topic overview',['main.tex','second.tex',data['id']])
        graph=KnowledgeGraph(self.root).graph()
        self.assertEqual(len(graph['documents']),4)
        self.assertEqual(sum(link['kind']=='workspace' for link in graph['links'] if 'kind' in link),4)
        self.assertEqual(WorkspaceNodes(self.root).get(hub['id'])['targets'],['main.tex','second.tex',data['id']])
        KnowledgeGraph(self.root).set_color('node',hub['id'],'#76c7b2')
        KnowledgeGraph(self.root).label_edge(hub['id'],'main.tex',['summarizes','references'])
        self.assertEqual(KnowledgeGraph(self.root).graph()['styles']['node_colors'][hub['id']],'#76c7b2')

    def test_stats_scope_and_empty_project(self):
        node=self.store.create('dashboard','Subset',['second.tex'])
        whole=self.client.get('/api/projects/Node%20test/workspace/stats').json()
        self.assertEqual((whole['documents'],whole['connections'],whole['assets']),(2,1,0))
        scoped=self.client.get('/api/projects/Node%20test/workspace/stats',params={'node':node['id']}).json()
        self.assertEqual((scoped['documents'],scoped['connections'],scoped['isolated']),(1,0,1))
        self.assertIsNone(scoped['assets'])

    def test_validation_metadata_escape_and_corrupt_file(self):
        with self.assertRaises(ValueError):self.store.create('dashboard','Escape',['../outside.tex'])
        with self.assertRaises(ValueError):self.store.create('data','Bad',[],None)
        node=self.store.create('dashboard','Valid',[])
        with self.assertRaises(ValueError):self.store.update(node['id'],'Self',[node['id']])
        self.store.store.write_text('bad json')
        with self.assertRaises(ValueError):self.store.create('dashboard','Do not overwrite',[])
        self.assertEqual(self.store.store.read_text(),'bad json')

    def test_invalid_provider_is_rejected_without_network(self):
        response=self.client.post('/api/projects/Node%20test/workspace/nodes',json={'kind':'data','title':'Bad','targets':[],'resource':{'provider':'evil','id':'anything'}})
        self.assertEqual(response.status_code,400)

    def test_local_project_registry_survives_restart(self):
        import os
        from unittest.mock import patch
        from app.core.project_manager import ProjectManager
        with patch.dict(os.environ,{'STARVIEW_DATA_DIR':str(self.root/'private-account')}):
            manager=ProjectManager()
            manager.add_project(Project(name='Remembered',root=self.root))
            self.assertEqual(ProjectManager().get_project('Remembered').root,self.root.resolve())
