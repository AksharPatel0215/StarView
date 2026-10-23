import unittest
from app.core.query_paths import path_question,query_path

class QueryPathTests(unittest.TestCase):
    def graph(self,connected=True):
        docs=[{'path':p,'title':t,'kind':k,'tags':[]} for p,t,k in [('modulus.tex','Modulus and Distance','document'),('product.tex','Multiplication','document'),('derivative.tex','Geometric Interpretation of the Derivative','document'),('index.tex','Section','document'),('@node/home','Overview','dashboard')]]
        pairs=[('modulus.tex','index.tex'),('index.tex','derivative.tex'),('modulus.tex','@node/home'),('@node/home','derivative.tex')]
        if connected:pairs += [('modulus.tex','product.tex'),('product.tex','derivative.tex')]
        return {'documents':docs,'links':[{'source':a,'target':b,'missing':False} for a,b in pairs]}
    def test_question_is_read_only_and_command_still_can_request_changes(self):
        self.assertTrue(path_question('How does modulus connect to the geometric interpretation of the derivative?'))
        self.assertFalse(path_question('Connect modulus.tex to derivative.tex'))
        self.assertFalse(path_question('Propose a connection between modulus and derivative'))
    def test_path_excludes_shortcuts_through_sections_and_dashboards(self):
        result=query_path('How does modulus connect to the geometric interpretation of the derivative?',self.graph())
        self.assertTrue(result['found'])
        self.assertEqual(result['paths'],['modulus.tex','product.tex','derivative.tex'])
    def test_no_concept_only_path_is_reported_honestly(self):
        result=query_path('How does modulus connect to the geometric interpretation of the derivative?',self.graph(False))
        self.assertFalse(result['found'])
        self.assertEqual(result['paths'],['modulus.tex','derivative.tex'])
    def test_comparisons_are_not_graph_paths(self):
        from app.core.query_paths import comparison_topics
        for other in ['secant','bisection']:
            prompt=f"Explain to me the difference between Newton's method and the {other} method"
            self.assertFalse(path_question(prompt))
            self.assertIsNone(query_path(prompt,self.graph()))
            self.assertEqual(comparison_topics(prompt),("Newton's method",f'the {other} method'))
