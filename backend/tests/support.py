import os
import tempfile
_TEST_DATA = tempfile.TemporaryDirectory(prefix="starview-tests-")
os.environ.setdefault("STARVIEW_DATA_DIR", _TEST_DATA.name)
from fastapi.testclient import TestClient as Client

def TestClient(app, **kwargs):
    """Authenticate route tests without weakening production authentication."""
    client = Client(app, **kwargs)
    token, csrf = app.state.security.issue()
    client.cookies.set('starview_session', token)
    client.headers.update({'Origin': 'http://127.0.0.1:5173', 'X-CSRF-Token': csrf})
    return client
