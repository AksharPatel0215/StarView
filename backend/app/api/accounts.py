import os
from fastapi import APIRouter, Request, Query, HTTPException
from starlette.responses import RedirectResponse
from app.services.accounts import Accounts

router = APIRouter(prefix='/api/accounts')

@router.get('')
def accounts(request: Request):
    return Accounts(request.app.state.security).statuses()

@router.post('/{provider}/connect')
def connect(provider: str, request: Request):
    return {'url': Accounts(request.app.state.security).start(provider, request.state.session['digest'])}

@router.get('/{provider}/callback')
def callback(provider: str, request: Request, state: str = Query(max_length=100), code: str = Query(default='', max_length=4096), error: str = Query(default='', max_length=200)):
    origin = os.environ.get('STARVIEW_ORIGIN', 'http://127.0.0.1:5173')
    try:
        if error or not code:
            raise HTTPException(400, 'Account connection was cancelled')
        Accounts(request.app.state.security).finish(provider, state, code, request.state.session['digest'])
        result = 'connected'
    except HTTPException:
        result = 'failed'
    return RedirectResponse(origin + '/?account=' + result, status_code=303)

@router.delete('/{provider}')
def disconnect(provider: str, request: Request):
    service = Accounts(request.app.state.security)
    service.disconnect(provider)
    return service.statuses()

@router.get('/{provider}/resources')
def resources(provider: str, request: Request, folder: str = Query(default='', max_length=200), cursor: str = Query(default='', max_length=4096)):
    return Accounts(request.app.state.security).browse(provider, folder, cursor)
