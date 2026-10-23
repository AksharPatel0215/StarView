import asyncio
import json
import unittest
from unittest.mock import AsyncMock,patch
import httpx
from app.core.provider_http import post_with_retries
from app.core.grounding_model import structured

class ProviderRetryTests(unittest.TestCase):
    def response(self,status,headers=None):
        return httpx.Response(status,json={'choices':[{'message':{'content':json.dumps({'status':'ok'})}}]},headers=headers,request=httpx.Request('POST','https://example.test'))
    def test_transient_failure_recovers_without_changing_model(self):
        client=AsyncMock();client.post.side_effect=[self.response(503),self.response(502),self.response(200)]
        with patch('app.core.provider_http.asyncio.sleep',AsyncMock()) as sleep:
            result=asyncio.run(post_with_retries(client,'https://example.test',headers={},json={'model':'chosen'},enabled=True))
        self.assertEqual(result.status_code,200);self.assertEqual(client.post.call_count,3);self.assertEqual(sleep.await_count,2)
        self.assertTrue(all(c.kwargs['json']=={'model':'chosen'} for c in client.post.call_args_list))
    def test_retries_are_bounded_and_retry_after_is_capped(self):
        client=AsyncMock();client.post.return_value=self.response(503,{'retry-after':'1000'})
        with patch('app.core.provider_http.asyncio.sleep',AsyncMock()) as sleep:
            result=asyncio.run(post_with_retries(client,'https://example.test',headers={},json={},enabled=True))
        self.assertEqual(result.status_code,503);self.assertEqual(client.post.call_count,3)
        self.assertTrue(all(c.args[0]<=10 for c in sleep.call_args_list))
    def test_auth_quota_and_invalid_requests_are_not_retried(self):
        for status in (400,401,403,429):
            client=AsyncMock();client.post.return_value=self.response(status)
            asyncio.run(post_with_retries(client,'https://example.test',headers={},json={},enabled=True))
            self.assertEqual(client.post.call_count,1)
    def test_local_requests_are_not_retried(self):
        client=AsyncMock();client.post.return_value=self.response(503)
        asyncio.run(post_with_retries(client,'http://localhost',headers={},json={}))
        self.assertEqual(client.post.call_count,1)
    def test_transport_error_can_recover(self):
        client=AsyncMock();client.post.side_effect=[httpx.ConnectError('unavailable'),self.response(200)]
        with patch('app.core.provider_http.asyncio.sleep',AsyncMock()):
            response=asyncio.run(post_with_retries(client,'https://example.test',headers={},json={},enabled=True))
        self.assertEqual(response.status_code,200)
    def test_structured_response_recovers_from_503(self):
        with patch('httpx.AsyncClient.post',AsyncMock(side_effect=[self.response(503),self.response(200)])),patch('app.core.provider_http.asyncio.sleep',AsyncMock()):
            result=asyncio.run(structured('gemini-test','Return status',{}, {'type':'object'},'test-key'))
        self.assertEqual(result,{'status':'ok'})
    def test_exhausted_503_fails_closed(self):
        with patch('httpx.AsyncClient.post',AsyncMock(return_value=self.response(503))) as post,patch('app.core.provider_http.asyncio.sleep',AsyncMock()):
            with self.assertRaisesRegex(RuntimeError,'temporarily unavailable after three attempts'):
                asyncio.run(structured('gemini-test','Return status',{}, {'type':'object'},'test-key'))
        self.assertEqual(post.call_count,3)
