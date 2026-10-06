from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

router = APIRouter(prefix='/api/auth')
COOKIE = 'starview_session'

class Credentials(BaseModel):
    name: str = Field(max_length=80)
    password: str = Field(max_length=256)

class PasswordChange(BaseModel):
    current: str = Field(max_length=256)
    password: str = Field(max_length=256)


def signed_in(request, response, result):
    token, csrf = result
    response.set_cookie(COOKIE, token, httponly=True, secure=request.url.scheme == 'https', samesite='lax', max_age=43200, path='/')
    response.headers['Cache-Control'] = 'no-store'
    return {'authenticated': True, 'setup_required': False, 'name': request.app.state.security.owner(), 'csrf': csrf}

@router.get('/status')
def status(request: Request):
    security = request.app.state.security
    session = security.session(request.cookies.get(COOKIE))
    return {'authenticated': bool(session), 'setup_required': security.owner() is None, 'name': security.owner() if session else None, 'csrf': session['csrf'] if session else None}

@router.post('/setup')
def setup(credentials: Credentials, request: Request, response: Response):
    return signed_in(request, response, request.app.state.security.setup(credentials.name, credentials.password))

@router.post('/login')
def login(credentials: Credentials, request: Request, response: Response):
    return signed_in(request, response, request.app.state.security.login(credentials.name, credentials.password))

@router.post('/logout')
def logout(request: Request, response: Response):
    request.app.state.security.logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path='/')
    return {'ok': True}

@router.post('/password')
def password_change(body: PasswordChange, request: Request, response: Response):
    return signed_in(request, response, request.app.state.security.change_password(body.current, body.password, request.cookies.get(COOKIE)))
