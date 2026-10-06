import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import create_app

ORIGIN = 'http://127.0.0.1:5173'
PASSWORD = 'test-password-at-least-12'

class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.directory.name))
        self.client = TestClient(self.app, headers={'Origin': ORIGIN})

    def tearDown(self):
        self.client.close()
        self.directory.cleanup()

    def setup(self):
        result = self.client.post('/api/auth/setup', json={'name':'Tester','password':PASSWORD})
        self.assertEqual(result.status_code, 200)
        self.client.headers['X-CSRF-Token'] = result.json()['csrf']
        return result

    def test_protects_every_file_and_project_route(self):
        for path in ['/api/projects','/api/projects/x/files/main.tex','/api/projects/x/pdf/main.pdf','/api/projects/x/assets/photo.png','/api/projects/x/workspace/nodes','/api/accounts']:
            self.assertEqual(self.client.get(path).status_code,401,path)
        self.assertTrue(self.client.get('/api/auth/status').json()['setup_required'])

    def test_setup_cookie_csrf_and_logout(self):
        self.assertEqual(self.client.post('/api/auth/setup',json={'name':'Tester','password':'short'}).status_code,400)
        result=self.setup()
        self.assertIn('HttpOnly', result.headers['set-cookie'])
        self.assertIn('SameSite=lax', result.headers['set-cookie'])
        self.assertEqual(self.client.post('/api/auth/setup',json={'name':'Other','password':PASSWORD}).status_code,409)
        self.assertEqual(self.client.get('/api/accounts').status_code,200)
        self.assertIn("sandbox", self.client.get('/api/accounts').headers['Content-Security-Policy'])
        self.assertEqual(self.client.post('/api/auth/logout',headers={'X-CSRF-Token':''}).status_code,403)
        self.assertEqual(self.client.post('/api/auth/logout',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.post('/api/auth/logout').status_code,200)
        self.assertEqual(self.client.get('/api/projects').status_code,401)

    def test_rate_limit_password_and_session_revocation(self):
        self.setup()
        other=TestClient(self.app,headers={'Origin':ORIGIN})
        session=other.post('/api/auth/login',json={'name':'Tester','password':PASSWORD})
        self.assertEqual(session.status_code,200)
        self.assertEqual(self.client.post('/api/auth/password',json={'current':PASSWORD,'password':'new-password-at-least-12'}).status_code,200)
        self.assertEqual(other.get('/api/projects').status_code,401)
        for _ in range(8):
            self.assertEqual(other.post('/api/auth/login',json={'name':'Tester','password':'wrong'}).status_code,401)
        self.assertEqual(other.post('/api/auth/login',json={'name':'Tester','password':'new-password-at-least-12'}).status_code,429)
        other.close()

    def test_local_boundaries_and_password_storage(self):
        self.setup()
        self.assertEqual(self.client.get('/api/projects',headers={'Host':'evil.example'}).status_code,403)
        with TestClient(self.app,client=('192.0.2.1',1234)) as remote:
            self.assertEqual(remote.get('/api/auth/status').status_code,403)
        raw=(Path(self.directory.name)/'account.sqlite3').read_bytes()
        self.assertNotIn(PASSWORD.encode(),raw)
        self.assertNotIn(self.client.cookies.get('starview_session').encode(),raw)
        self.assertEqual((Path(self.directory.name)/'account.sqlite3').stat().st_mode & 0o777,0o600)

    def test_origin_required_for_first_run_and_login(self):
        with TestClient(self.app) as browser:
            self.assertEqual(browser.post('/api/auth/setup',json={'name':'Tester','password':PASSWORD}).status_code,403)
            self.assertEqual(browser.post('/api/auth/login',json={'name':'Tester','password':PASSWORD}).status_code,403)

    def test_expired_session_cannot_read_private_files(self):
        self.setup()
        with self.app.state.security.db() as db:
            db.execute('UPDATE sessions SET expires=0')
        self.assertEqual(self.client.get('/api/projects').status_code,401)
        self.assertFalse(self.client.get('/api/auth/status').json()['authenticated'])
