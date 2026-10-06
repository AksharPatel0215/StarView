import hmac
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from app.api.projects import router as projects_router
from app.api.auth import router as auth_router, COOKIE
from app.core.security import Security


def create_app(data_dir: Path | None = None):
    app = FastAPI(title='StarView API', docs_url=None, redoc_url=None, openapi_url=None)
    app.state.security = Security(data_dir or Path(os.environ.get('STARVIEW_DATA_DIR', Path.home() / '.local' / 'share' / 'starview')))
    origins = {os.environ.get('STARVIEW_ORIGIN', 'http://127.0.0.1:5173'), 'http://localhost:5173'}
    app.add_middleware(CORSMiddleware, allow_origins=sorted(origins), allow_credentials=True, allow_methods=['GET', 'POST', 'PUT', 'DELETE'], allow_headers=['Content-Type', 'X-CSRF-Token'])

    @app.middleware('http')
    async def protection(request, call_next):
        if request.client and request.client.host not in {'127.0.0.1', '::1', 'testclient'}:
            return JSONResponse({'detail': 'StarView is a local application; connect on this computer'}, 403)
        if request.url.hostname not in {'127.0.0.1', 'localhost', '::1', 'testserver'}:
            return JSONResponse({'detail': 'Invalid local host'}, 403)
        unsafe = request.method not in {'GET', 'HEAD', 'OPTIONS'}
        if unsafe and request.headers.get('origin') not in origins:
            return JSONResponse({'detail': 'Request origin is not allowed'}, 403)
        public = request.url.path in {'/api/health', '/api/auth/status', '/api/auth/setup', '/api/auth/login'}
        if not public and request.method != 'OPTIONS':
            session = app.state.security.session(request.cookies.get(COOKIE))
            if not session:
                return JSONResponse({'detail': 'Sign in to your local account'}, 401)
            request.state.session = session
            if unsafe and not hmac.compare_digest(request.headers.get('x-csrf-token', '').encode(), session['csrf'].encode()):
                return JSONResponse({'detail': 'Session verification failed. Reload and try again.'}, 403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    app.include_router(auth_router)
    app.include_router(projects_router)
    from app.api.workspace import router as workspace_router
    from app.api.accounts import router as accounts_router
    app.include_router(workspace_router)
    app.include_router(accounts_router)

    @app.get('/api/health')
    def health():
        return {'status': 'ok'}
    return app

app = create_app()
