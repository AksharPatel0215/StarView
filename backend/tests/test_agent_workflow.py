import asyncio
import unittest
from unittest.mock import AsyncMock,patch
from app.services.note_agent import request_kind
from app.core.grounded_rag import verify_claims

class WorkflowTests(unittest.TestCase):
    def test_creation_phrasings(self):
        for prompt in ['Make me notes on residues','Turn that into a note','Create Limits/new.tex and connect it to geometry.tex','Generate a note about roots']:
            self.assertEqual(request_kind(prompt),'create_note',prompt)
        self.assertEqual(request_kind('What is a residue?'),'answer')
        self.assertEqual(request_kind('Do not make changes; explain residues'),'answer')
    def test_batch_checks_preserve_claim_identity(self):
        claims=[{'text':'first'},{'text':'second'}]
        responses=[{'verdicts':[{'index':0,'status':'supported'},{'index':1,'status':'unsupported'}]}, {'verdicts':[{'index':0,'status':'supported'}]}]
        with patch('app.core.grounded_rag.structured',AsyncMock(side_effect=responses)) as model:
            self.assertEqual(asyncio.run(verify_claims(claims,'test','')),claims[:1])
            self.assertEqual(model.call_count,2)
    def test_duplicate_verdicts_fail_closed(self):
        with patch('app.core.grounded_rag.structured',AsyncMock(return_value={'verdicts':[{'index':0,'status':'supported'},{'index':0,'status':'supported'}]})):
            self.assertEqual(asyncio.run(verify_claims([{'text':'test'}],'test','')),[])
