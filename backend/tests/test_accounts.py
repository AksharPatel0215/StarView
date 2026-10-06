import io
import httpx
import json
import os
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch
from fastapi import HTTPException
from openpyxl import Workbook
from app.core.security import Security
from app.services.accounts import Accounts

class AccountTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.security=Security(Path(self.directory.name))
        self.service=Accounts(self.security)
        self.env=patch.dict(os.environ,{'STARVIEW_GOOGLE_CLIENT_ID':'test-id','STARVIEW_GOOGLE_CLIENT_SECRET':'test-secret','STARVIEW_MICROSOFT_CLIENT_ID':'test-id','STARVIEW_MICROSOFT_CLIENT_SECRET':'test-secret'})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def test_pkce_state_is_bound_to_session_and_single_use_for_both_providers(self):
        for provider in ('google','microsoft'):
            url=self.service.start(provider,'session-a')
            query=parse_qs(urlparse(url).query)
            self.assertEqual(query['code_challenge_method'],['S256'])
            self.assertNotIn('write',query['scope'][0].lower())
            with self.assertRaises(HTTPException):self.service.finish(provider,query['state'][0],'code','wrong-session')
            with patch.object(self.service,'exchange',return_value={'access_token':'private-token','refresh_token':'private-refresh','expires_at':time.time()+3600}) as exchange:
                self.service.finish(provider,query['state'][0],'code','session-a')
                self.assertTrue(exchange.call_args.args[1]['code_verifier'])
            with self.assertRaises(HTTPException):self.service.finish(provider,query['state'][0],'code','session-a')
        self.assertNotIn(b'private-token', self.security.path.read_bytes())
        self.assertEqual((Path(self.directory.name)/'token.key').stat().st_mode & 0o777,0o600)

    def test_refresh_and_disconnect(self):
        self.service.save('google',{'access_token':'old','refresh_token':'refresh','expires_at':0})
        with patch.object(self.service,'exchange',return_value={'access_token':'new','expires_at':time.time()+3600}) as exchange:
            self.assertEqual(self.service.token('google'),'new')
            self.assertEqual(exchange.call_args.args[1]['grant_type'],'refresh_token')
        self.assertEqual(self.service.token('google'),'new')
        self.service.disconnect('google')
        with self.assertRaises(HTTPException):self.service.token('google')

    def test_resource_ids_and_missing_configuration(self):
        for value in ['../secret','https://evil.example/x','id?token=x','']:
            with self.assertRaises(HTTPException):self.service.resource_id(value)
        with patch.dict(os.environ,{'STARVIEW_GOOGLE_CLIENT_SECRET':''}):
            with self.assertRaises(HTTPException) as error:self.service.start('google','session')
            self.assertEqual(error.exception.status_code,503)

    def test_word_text_and_excel_preview_are_plain_data(self):
        content=io.BytesIO()
        with zipfile.ZipFile(content,'w') as archive:
            archive.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&lt;script&gt;hello&lt;/script&gt;</w:t></w:r></w:p></w:body></w:document>')
        resource={'provider':'microsoft','id':'test','name':'Notes.docx','kind':'document','mime':'docx'}
        with patch.object(self.service,'resource',return_value=resource), patch.object(self.service,'fetch',return_value=content.getvalue()):
            preview=self.service.preview(resource)
            self.assertEqual(preview['paragraphs'],['<script>hello</script>'])
        book=Workbook();book.active.title='Results';book.active.append(['x','y']);book.active.append([1,2]);buffer=io.BytesIO();book.save(buffer)
        resource={**resource,'name':'Results.xlsx','kind':'sheet','mime':'xlsx'}
        with patch.object(self.service,'resource',return_value=resource), patch.object(self.service,'fetch',return_value=buffer.getvalue()):
            preview=self.service.preview(resource)
            self.assertEqual(preview['sheets'][0]['rows'],[['x','y'],['1','2']])

    def test_google_document_export_uses_pdf(self):
        resource={'provider':'google','id':'test','name':'Notes','kind':'document','mime':'application/vnd.google-apps.document'}
        with patch.object(self.service,'resource',return_value=resource),patch.object(self.service,'fetch',return_value=b'%PDF-test') as fetch:
            self.assertEqual(self.service.preview(resource)['kind'],'pdf')
            self.assertEqual(fetch.call_args.args[2],{'mimeType':'application/pdf'})


    def test_microsoft_word_uses_pdf_conversion_when_available(self):
        resource={'provider':'microsoft','id':'test','name':'Notes.docx','kind':'document','mime':'docx'}
        with patch.object(self.service,'resource',return_value=resource),patch.object(self.service,'fetch',return_value=b'%PDF-sample') as fetch:
            self.assertEqual(self.service.preview(resource)['kind'],'pdf')
            self.assertEqual(fetch.call_args.args[2],{'format':'pdf'})

    def test_archive_expansion_is_bounded_before_document_parsing(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,'w') as archive:archive.writestr('word/document.xml','hello')
        resource={'provider':'microsoft','id':'test','name':'Notes.docx','kind':'document','mime':'docx'}
        with patch.object(self.service,'resource',return_value=resource),patch.object(self.service,'fetch',return_value=data.getvalue()),patch('app.services.accounts.zipfile.ZipFile.infolist',return_value=[type('Entry',(),{'file_size':81*1024*1024})()]):
            # Oversized uncompressed archives fail before reading document XML.
            with self.assertRaises(HTTPException):self.service.preview(resource)

    def test_signed_download_never_forwards_tokens_and_rejects_other_hosts(self):
        self.service.save('microsoft',{'access_token':'private-access','expires_at':time.time()+3600})
        calls=[]
        def handler(request):
            calls.append(request)
            if request.url.host=='graph.microsoft.com':
                return httpx.Response(302,headers={'Location':'https://sample.files.1drv.com/download'})
            self.assertNotIn('authorization',request.headers)
            return httpx.Response(200,content=b'preview')
        client=httpx.Client(transport=httpx.MockTransport(handler))
        with patch('app.services.accounts.httpx.Client',return_value=client):
            self.assertEqual(self.service.fetch('microsoft','/me/drive/items/test/content',binary=True),b'preview')
        self.assertEqual(len(calls),2)
        def bad_redirect(request):
            return httpx.Response(302,headers={'Location':'https://evil.example/steal'})
        client=httpx.Client(transport=httpx.MockTransport(bad_redirect))
        with patch('app.services.accounts.httpx.Client',return_value=client),self.assertRaises(HTTPException) as error:
            self.service.fetch('microsoft','/me/drive/items/test/content',binary=True)
        self.assertEqual(error.exception.status_code,502)

    def test_body_limit_and_expired_oauth_state(self):
        query=parse_qs(urlparse(self.service.start('google','session')).query)
        with self.security.db() as db:
            db.execute('UPDATE oauth_states SET expires=0')
        with self.assertRaises(HTTPException):self.service.finish('google',query['state'][0],'code','session')
        response=httpx.Response(200,content=b'123456')
        with patch('app.services.accounts.LIMIT',5),self.assertRaises(HTTPException) as error:
            self.service.body(response,True)
        self.assertEqual(error.exception.status_code,413)
