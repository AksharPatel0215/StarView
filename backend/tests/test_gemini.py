import asyncio
import json
import unittest
from unittest.mock import AsyncMock,patch
import httpx
from app.services.note_agent import ollama_status
from app.core.grounding_model import structured
from app.core.grounded_rag import GENERATION

class GeminiTests(unittest.TestCase):
    def test_gemini_is_available_without_ollama(self):
        with patch('app.services.note_agent.local_ollama_status',AsyncMock(return_value={'available':False,'models':[],'default_model':''})),patch('app.services.note_agent.gemini_config',return_value=('test-key','gemini-3.8-flash')):
            self.assertEqual(asyncio.run(ollama_status())['default_model'],'gemini-3.8-flash')
    def run_request(self,status,body):
        response=httpx.Response(status,json=body,request=httpx.Request('POST','https://example.test'))
        with patch('httpx.AsyncClient.post',AsyncMock(return_value=response)) as post:
            result=asyncio.run(structured('gemini-3.8-flash','Use evidence.',{},GENERATION,'test-key'))
            return result,post.call_args
    def test_schema_and_key_are_sent_separately(self):
        data={'claims':[]};result,request=self.run_request(200,{'choices':[{'message':{'content':json.dumps(data)}}]})
        self.assertEqual(result,data);self.assertEqual(request.kwargs['headers']['Authorization'],'Bearer test-key')
        self.assertEqual(request.kwargs['json']['response_format']['type'],'json_schema')
        self.assertNotIn('test-key',json.dumps(request.kwargs['json']))
    def test_quota_error_does_not_silently_switch_providers(self):
        with self.assertRaisesRegex(RuntimeError,'quota reached'):self.run_request(429,{'error':{}})
    def test_rejected_key_has_actionable_message(self):
        with self.assertRaisesRegex(RuntimeError,'rejected the API key'):self.run_request(403,{'error':{}})

    def test_local_model_remains_default_when_gemini_is_configured(self):
        local={'available':True,'models':['deepseek-r1:7b'],'default_model':'auto','fast_model':'deepseek-r1:7b','draft_model':'deepseek-r1:7b'}
        with patch('app.services.note_agent.local_ollama_status',AsyncMock(return_value=local)),patch('app.services.note_agent.gemini_config',return_value=('test-key','gemini-test')):
            status=asyncio.run(ollama_status())
        self.assertEqual(status['default_model'],'auto')
        self.assertEqual(status['fast_model'],'deepseek-r1:7b')
        self.assertIn('gemini-test',status['models'])
