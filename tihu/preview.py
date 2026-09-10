"""Separate-origin artifact preview. It never receives credential decryption keys."""
import base64
import mimetypes
from urllib.parse import quote
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from . import db
from .config import settings
from .security import sign, safe_path

app=FastAPI(title='TiHu Preview',docs_url=None,redoc_url=None)

@app.on_event('startup')
def startup(): db.check_schema()

@app.get('/health')
def health():return {'ok':True}


def load(run_id,sha,expires,token):
    if expires < int(db.now()) or expires > int(db.now())+360:
        raise HTTPException(404,'not_found')
    with db.engine.connect() as c:
        run=db.row(c,select(db.runs).where(db.runs.c.id==run_id,db.runs.c.status=='succeeded',db.runs.c.hidden.is_(False)))
        artifact=db.row(c,select(db.artifacts).where(db.artifacts.c.run_id==run_id,db.artifacts.c.sha256==sha))
    if not run or not artifact:raise HTTPException(404,'not_found')
    scope='public' if run['published'] else 'private:'+run['owner_id']
    if sign(f'{run_id}:{sha}:{expires}:{scope}')!=token:raise HTTPException(404,'not_found')
    return artifact


def serve(run_id,sha,expires,token,path):
    artifact=load(run_id,sha,expires,token)
    if not path:
        return RedirectResponse('index.html',status_code=307,headers={'Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer'})
    if not safe_path(path) or path not in artifact['files']:raise HTTPException(404,'not_found')
    try:data=base64.b64decode(artifact['files'][path],validate=True)
    except Exception:raise HTTPException(404,'not_found') from None
    content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream'
    # A sandboxed document has an opaque origin: 'self' and same-origin CORP
    # reject its own CSS/modules/images. Authorize only this signed bundle,
    # with noncredentialed CORS for modules, rather than the whole preview host.
    capability=f'{settings.preview_origin}/p/{quote(run_id,safe="")}/{quote(sha,safe="")}/{expires}/{quote(token,safe="")}/'
    headers={
        'Cache-Control':'no-store, max-age=0',
        'X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'no-referrer',
        'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
        'Cross-Origin-Resource-Policy':'cross-origin',
        'Access-Control-Allow-Origin':'*',
        'Content-Security-Policy':(
            f"sandbox allow-scripts; default-src 'none'; script-src {capability} 'unsafe-inline' blob:; "
            f"style-src {capability} 'unsafe-inline'; img-src {capability} data: blob:; "
            f"font-src {capability} data:; media-src {capability} data: blob:; "
            "connect-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; "
            "object-src 'none'; form-action 'none'; base-uri 'none'; "
            f"frame-ancestors {settings.app_origin}; navigate-to 'none'"
        ),
    }
    return Response(data,media_type=content_type,headers=headers)

@app.get('/p/{run_id}/{sha}/{expires}/{token}')
def index(run_id:str,sha:str,expires:int,token:str):
    load(run_id,sha,expires,token)
    location=f'/p/{quote(run_id,safe="")}/{quote(sha,safe="")}/{expires}/{quote(token,safe="")}/index.html'
    return RedirectResponse(location,status_code=307,headers={'Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer'})
@app.get('/p/{run_id}/{sha}/{expires}/{token}/{path:path}')
def asset(run_id:str,sha:str,expires:int,token:str,path:str):return serve(run_id,sha,expires,token,path)
