"""TiHu HTTP API. No provider secret is ever returned to clients."""
import asyncio
import base64
import json
import secrets
import smtplib
from email.message import EmailMessage
from typing import Literal
from urllib.parse import quote

from fastapi import Body, Cookie, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import and_, delete, func, insert, select, update

from . import db, domain
from .config import settings
from .security import DUMMY_HASH, canonical_base, digest, discover, parse_skill, password_hasher, seal, stable_hash, throttle, unseal, verify_password, sign

app = FastAPI(title='TiHu', version='0.1.0', docs_url=None, redoc_url=None)
MAX_BODY = 512 * 1024


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Register(Input):
    username: str = Field(min_length=2, max_length=32, pattern=r'^[A-Za-z0-9_-]+$')
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=200)


class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class KeyInput(Input):
    label: str = Field(min_length=1, max_length=60)
    base_url: str = Field(min_length=8, max_length=300)
    protocol: Literal['openai', 'responses', 'anthropic'] = 'openai'
    api_key: str = Field(min_length=8, max_length=500)


class PromptTemplate(Input):
    name: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=5000)


class Challenge(Input):
    title: str = Field(min_length=3, max_length=100)
    description: str = Field(min_length=10, max_length=1500)
    category: str = Field(default='Creative', min_length=2, max_length=30)
    prompt: str = Field(min_length=10, max_length=6000)
    rubric: str = Field(min_length=3, max_length=3000)


class VersionInput(Input):
    prompt: str = Field(min_length=10, max_length=6000)
    rubric: str = Field(min_length=3, max_length=3000)


class RunInput(Input):
    key_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    version_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    model: str = Field(min_length=1, max_length=200)
    prompt: str = Field(default='', max_length=5000)
    thinking: Literal['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] = 'off'
    skill_ids: list[str] = Field(default_factory=list, max_length=4)
    consent: bool = False


class Publish(Input): published: bool
class Vote(Input):
    kind: Literal['capability', 'funny']
    active: bool = True
class Comment(Input): body: str = Field(min_length=1, max_length=2000)
class Report(Input): reason: str = Field(min_length=5, max_length=500)
class Moderate(Input):
    action: Literal['suspend_user','reinstate_user','archive_challenge','hide_run','unhide_run','resolve_report']
    target: str = Field(min_length=1, max_length=100)
class TokenBody(Input): token: str = Field(min_length=20, max_length=200)
class ResetBody(TokenBody): password: str = Field(min_length=12, max_length=200)
class EmailBody(Input): email: str = Field(min_length=3, max_length=254)


@app.exception_handler(RequestValidationError)
async def validation_error(_request, exc):
    errors=[]
    for item in exc.errors():
        errors.append({'field': '.'.join(str(x) for x in item['loc']), 'type': item['type']})
    return JSONResponse({'detail':'invalid_request','errors':errors}, status_code=422)


@app.middleware('http')
async def boundaries(request: Request, call_next):
    length = request.headers.get('content-length')
    if length and int(length) > MAX_BODY:
        return JSONResponse({'detail':'body_too_large'}, status_code=413)
    if request.method not in ('GET','HEAD','OPTIONS'):
        origin=request.headers.get('origin')
        if origin and origin.rstrip('/') != settings.app_origin:
            return JSONResponse({'detail':'origin_denied'}, status_code=403)
        # Cookie-authenticated mutations require a CSRF token, except login/register/reset token flows.
        if request.cookies.get(settings.cookie) and request.url.path not in ('/api/auth/login','/api/auth/register','/api/auth/reset','/api/auth/verify'):
            raw=request.cookies.get(settings.cookie)
            with db.engine.connect() as c:
                sess=db.row(c, select(db.sessions).where(db.sessions.c.digest==digest(raw), db.sessions.c.expires>db.now()))
            if sess:
                expected=sign('csrf:'+raw)
                if not secrets.compare_digest(request.headers.get('x-csrf-token',''), expected):
                    return JSONResponse({'detail':'csrf_denied'}, status_code=403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['Permissions-Policy']='camera=(), microphone=(), geolocation=(), payment=()'
    return response


def session_row(request: Request):
    raw=request.cookies.get(settings.cookie)
    if not raw: return None
    with db.engine.connect() as c:
        sess=db.row(c, select(db.sessions).where(db.sessions.c.digest==digest(raw), db.sessions.c.expires>db.now()))
        if not sess: return None
        account=db.row(c, select(db.users).where(db.users.c.id==sess['owner_id']))
    return account if account and not account['suspended'] else None


def user(request: Request):
    value=session_row(request)
    if not value: raise HTTPException(401,'authentication_required')
    return value


def optional_user(request: Request): return session_row(request)

def verified_user(who=Depends(user)):
    if not who['verified'] or who['suspended']: raise HTTPException(403,'account_not_eligible')
    return who

def admin(who=Depends(user)):
    if who['role']!='admin': raise HTTPException(403,'admin_required')
    return who


def safe_user(row): return {k:row[k] for k in ('id','username','email','role','verified','created')}

def create_session(c, owner_id, response: Response):
    raw=secrets.token_urlsafe(32); expires=db.now()+30*86400
    c.execute(insert(db.sessions).values(digest=digest(raw),owner_id=owner_id,expires=expires,created=db.now()))
    response.set_cookie(settings.cookie,raw,max_age=30*86400,httponly=True,secure=settings.production,samesite='lax',path='/')
    return sign('csrf:'+raw)


def deliver(address: str, subject: str, text: str):
    if not settings.smtp_host:
        return False
    message=EmailMessage();message['From']=settings.mail_from;message['To']=address;message['Subject']=subject;message.set_content(text)
    with smtplib.SMTP(settings.smtp_host,settings.smtp_port,timeout=10) as smtp:
        smtp.starttls()
        if settings.smtp_user:smtp.login(settings.smtp_user,settings.smtp_password)
        smtp.send_message(message)
    return True


def mail_token(c, owner_id, purpose):
    raw=secrets.token_urlsafe(32)
    c.execute(delete(db.tokens).where(db.tokens.c.owner_id==owner_id,db.tokens.c.purpose==purpose))
    c.execute(insert(db.tokens).values(digest=digest(raw),owner_id=owner_id,purpose=purpose,expires=db.now()+1800))
    return raw


@app.on_event('startup')
def startup():
    db.init(); domain.seed()


@app.get('/api/config')
def config():
    return {'app_origin':settings.app_origin,'preview_origin':settings.preview_origin,'providers':settings.allowed_bases,'harness':domain.harness(),'registration':settings.registration}

@app.get('/api/me')
def me(request:Request):
    who=session_row(request)
    if not who:return {'user':None,'csrf':None}
    raw=request.cookies.get(settings.cookie)
    return {'user':safe_user(who),'csrf':sign('csrf:'+raw)}

@app.post('/api/auth/register',status_code=201)
def register(body:Register,response:Response):
    if not settings.registration: raise HTTPException(403,'registration_closed')
    throttle('register:'+body.email.lower(),10,3600)
    email=body.email.strip().lower()
    with db.engine.begin() as c:
        exists=c.execute(select(db.users.c.id).where((func.lower(db.users.c.email)==email)|(func.lower(db.users.c.username)==body.username.lower()))).first()
        if exists: raise HTTPException(409,'account_exists')
        ident=db.uid(); verified=not bool(settings.smtp_host)
        c.execute(insert(db.users).values(id=ident,username=body.username,email=email,password=password_hasher.hash(body.password),role='user',verified=verified,suspended=False,created=db.now()))
        csrf=create_session(c,ident,response)
        verify_token=mail_token(c,ident,'verify') if not verified else None
        row=domain.require_row(c,db.users,ident)
    if verify_token:
        try:deliver(email,'Verify your TiHu account',f'{settings.app_origin}/#/verify?token={verify_token}')
        except (OSError,smtplib.SMTPException):pass
    return {'user':safe_user(row),'csrf':csrf}

@app.post('/api/auth/login')
def login(body:Login,response:Response):
    throttle('login:'+body.email.lower(),20,900)
    with db.engine.begin() as c:
        row=db.row(c,select(db.users).where(func.lower(db.users.c.email)==body.email.strip().lower()))
        encoded=row['password'] if row else DUMMY_HASH
        valid=verify_password(encoded,body.password)
        if not row or not valid or row['suspended']: raise HTTPException(401,'invalid_credentials')
        csrf=create_session(c,row['id'],response)
    return {'user':safe_user(row),'csrf':csrf}

@app.post('/api/auth/logout')
def logout(request:Request,response:Response):
    raw=request.cookies.get(settings.cookie)
    if raw:
        with db.engine.begin() as c:c.execute(delete(db.sessions).where(db.sessions.c.digest==digest(raw)))
    response.delete_cookie(settings.cookie,path='/')
    return {'ok':True}

@app.post('/api/auth/resend-verification')
def resend(who=Depends(user)):
    if who['verified']: return {'ok':True}
    with db.engine.begin() as c: token=mail_token(c,who['id'],'verify')
    try:deliver(who['email'],'Verify your TiHu account',f'{settings.app_origin}/#/verify?token={token}')
    except (OSError,smtplib.SMTPException):pass
    return {'ok':True}

@app.post('/api/auth/verify')
def verify(body:TokenBody):
    with db.engine.begin() as c:
        token=db.row(c,select(db.tokens).where(db.tokens.c.digest==digest(body.token),db.tokens.c.purpose=='verify',db.tokens.c.expires>db.now()))
        if not token: raise HTTPException(400,'invalid_or_expired_token')
        c.execute(update(db.users).where(db.users.c.id==token['owner_id']).values(verified=True));c.execute(delete(db.tokens).where(db.tokens.c.digest==digest(body.token)))
    return {'ok':True}

@app.post('/api/auth/forgot')
def forgot(body:EmailBody):
    throttle('forgot:'+body.email.lower(),10,3600)
    token=None;row=None
    with db.engine.begin() as c:
        row=db.row(c,select(db.users).where(func.lower(db.users.c.email)==body.email.strip().lower()))
        if row: token=mail_token(c,row['id'],'reset')
    if row and token:
        try:deliver(row['email'],'Reset your TiHu password',f'{settings.app_origin}/#/reset?token={token}')
        except (OSError,smtplib.SMTPException):pass
    return {'ok':True}

@app.post('/api/auth/reset')
def reset(body:ResetBody,response:Response):
    with db.engine.begin() as c:
        tok=db.row(c,select(db.tokens).where(db.tokens.c.digest==digest(body.token),db.tokens.c.purpose=='reset',db.tokens.c.expires>db.now()))
        if not tok: raise HTTPException(400,'invalid_or_expired_token')
        c.execute(update(db.users).where(db.users.c.id==tok['owner_id']).values(password=password_hasher.hash(body.password)))
        c.execute(delete(db.tokens).where(db.tokens.c.owner_id==tok['owner_id']))
        c.execute(delete(db.sessions).where(db.sessions.c.owner_id==tok['owner_id']))
    response.delete_cookie(settings.cookie,path='/');return {'ok':True}


@app.get('/api/keys')
def list_keys(who=Depends(user)):
    with db.engine.connect() as c:
        rows=db.rows(c,select(db.credentials).where(db.credentials.c.owner_id==who['id']).order_by(db.credentials.c.created.desc()))
    return [{k:x[k] for k in ('id','label','base_url','protocol','last4','models','created')} for x in rows]

@app.post('/api/keys',status_code=201)
def add_key(body:KeyInput,who=Depends(verified_user)):
    base=canonical_base(body.base_url);ident=db.uid()
    with db.engine.begin() as c:
        c.execute(insert(db.credentials).values(id=ident,owner_id=who['id'],label=body.label,base_url=base,protocol=body.protocol,sealed=seal(body.api_key,who['id'],ident),last4=body.api_key[-4:],models=[],created=db.now()))
        db.audit_log(c,who['id'],'credential.created',ident)
    return {'id':ident,'last4':body.api_key[-4:]}

@app.delete('/api/keys/{ident}')
def delete_key(ident:str,who=Depends(user)):
    with db.engine.begin() as c:
        domain.require_row(c,db.credentials,ident,who['id'])
        c.execute(update(db.runs).where(db.runs.c.key_id==ident,db.runs.c.status.in_(domain.ACTIVE)).values(status='canceled',finished=db.now(),error='credential_revoked'))
        c.execute(delete(db.credentials).where(db.credentials.c.id==ident));db.audit_log(c,who['id'],'credential.revoked',ident)
    return {'ok':True}

@app.post('/api/keys/{ident}/models')
async def models(ident:str,who=Depends(user)):
    with db.engine.connect() as c:key=domain.require_row(c,db.credentials,ident,who['id'])
    values=await discover(key['base_url'],key['protocol'],unseal(key['sealed'],who['id'],ident))
    with db.engine.begin() as c:c.execute(update(db.credentials).where(db.credentials.c.id==ident).values(models=values))
    return {'models':values}


@app.get('/api/prompts')
def list_prompts(who=Depends(user)):
    with db.engine.connect() as c:return db.rows(c,select(db.prompt_templates).where(db.prompt_templates.c.owner_id==who['id']).order_by(db.prompt_templates.c.created.desc()))
@app.post('/api/prompts',status_code=201)
def save_prompt(body:PromptTemplate,who=Depends(verified_user)):
    with db.engine.begin() as c:
        if c.execute(select(func.count()).select_from(db.prompt_templates).where(db.prompt_templates.c.owner_id==who['id'])).scalar_one()>=30:raise HTTPException(422,'prompt_limit')
        ident=db.uid();c.execute(insert(db.prompt_templates).values(id=ident,owner_id=who['id'],name=body.name,body=body.body,created=db.now()))
    return {'id':ident}
@app.delete('/api/prompts/{ident}')
def del_prompt(ident:str,who=Depends(user)):
    with db.engine.begin() as c:domain.require_row(c,db.prompt_templates,ident,who['id']);c.execute(delete(db.prompt_templates).where(db.prompt_templates.c.id==ident))
    return {'ok':True}

@app.get('/api/skills')
def list_skills(who=Depends(user)):
    with db.engine.connect() as c:return db.rows(c,select(db.skills.c.id,db.skills.c.name,db.skills.c.sha256,db.skills.c.created).where(db.skills.c.owner_id==who['id']).order_by(db.skills.c.created.desc()))
@app.post('/api/skills',status_code=201)
async def add_skill(request:Request,x_file_name:str=Header('SKILL.md'),x_skill_name:str=Header('Skill'),who=Depends(verified_user)):
    data=await request.body(); files=parse_skill(quote(x_file_name,safe='').replace('%','') if False else __import__('urllib.parse').parse.unquote(x_file_name),data)
    with db.engine.begin() as c:
        if c.execute(select(func.count()).select_from(db.skills).where(db.skills.c.owner_id==who['id'])).scalar_one()>=30:raise HTTPException(422,'skill_limit')
        ident=db.uid();c.execute(insert(db.skills).values(id=ident,owner_id=who['id'],name=__import__('urllib.parse').parse.unquote(x_skill_name)[:80],files=files,sha256=stable_hash(files),created=db.now()))
    return {'id':ident}
@app.delete('/api/skills/{ident}')
def del_skill(ident:str,who=Depends(user)):
    with db.engine.begin() as c:domain.require_row(c,db.skills,ident,who['id']);c.execute(delete(db.skills).where(db.skills.c.id==ident))
    return {'ok':True}


@app.get('/api/challenges')
def challenges(q:str='',limit:int=Query(50,ge=1,le=100)):
    with db.engine.connect() as c:
        stmt=select(db.challenges).where(db.challenges.c.archived.is_(False)).order_by(db.challenges.c.created.asc()).limit(limit)
        rows=db.rows(c,stmt)
    if q: rows=[x for x in rows if q.lower() in (x['title']+' '+x['description']).lower()]
    return rows

@app.get('/api/challenges/{ident}')
def challenge_detail(ident:str):
    with db.engine.connect() as c:
        row=domain.require_row(c,db.challenges,ident);row['versions']=db.rows(c,select(db.versions).where(db.versions.c.challenge_id==ident).order_by(db.versions.c.number.desc()))
    return row

@app.post('/api/challenges',status_code=201)
def create_challenge(body:Challenge,who=Depends(verified_user)):
    ident=db.uid();vid=db.uid();prompt=body.prompt.strip();rubric=body.rubric.strip()
    with db.engine.begin() as c:
        c.execute(insert(db.challenges).values(id=ident,owner_id=who['id'],title=body.title,description=body.description,category=body.category,current_version=1,archived=False,created=db.now()))
        c.execute(insert(db.versions).values(id=vid,challenge_id=ident,number=1,prompt=prompt,rubric=rubric,sha256=stable_hash({'prompt':prompt,'rubric':rubric}),created=db.now()))
    return {'id':ident,'version_id':vid}

@app.post('/api/challenges/{ident}/versions',status_code=201)
def create_version(ident:str,body:VersionInput,who=Depends(verified_user)):
    with db.engine.begin() as c:
        task=domain.require_row(c,db.challenges,ident)
        if task['owner_id']!=who['id'] and who['role']!='admin':raise HTTPException(403,'owner_required')
        number=task['current_version']+1;vid=db.uid();p=body.prompt.strip();r=body.rubric.strip()
        c.execute(insert(db.versions).values(id=vid,challenge_id=ident,number=number,prompt=p,rubric=r,sha256=stable_hash({'prompt':p,'rubric':r}),created=db.now()));c.execute(update(db.challenges).where(db.challenges.c.id==ident).values(current_version=number))
    return {'id':vid,'number':number}

@app.get('/api/stats')
def stats():
    with db.engine.connect() as c:
        ch=c.execute(select(func.count()).select_from(db.challenges).where(db.challenges.c.archived.is_(False))).scalar_one()
        works=c.execute(select(func.count()).select_from(db.runs).where(db.runs.c.published.is_(True),db.runs.c.hidden.is_(False),db.runs.c.status=='succeeded')).scalar_one()
        models_count=c.execute(select(func.count(func.distinct(db.runs.c.model))).where(db.runs.c.published.is_(True),db.runs.c.hidden.is_(False),db.runs.c.status=='succeeded')).scalar_one()
    return {'challenges':ch,'works':works,'models':models_count}


@app.post('/api/runs',status_code=201)
def submit_run(body:RunInput,idempotency_key:str=Header('',alias='Idempotency-Key'),who=Depends(verified_user)):
    if not body.consent:raise HTTPException(422,'billing_consent_required')
    return domain.enqueue(who['id'],body.model_dump(exclude={'consent'}),idempotency_key)

@app.get('/api/runs')
def list_runs(challenge:str|None=None,version:str|None=None,mine:bool=False,limit:int=Query(24,ge=1,le=100),who=Depends(optional_user)):
    with db.engine.connect() as c:
        stmt=domain.run_query()
        if mine:
            if not who:raise HTTPException(401,'authentication_required')
            stmt=stmt.where(db.runs.c.owner_id==who['id'])
        else:stmt=stmt.where(*domain.public_conditions(challenge,version,'all'))
        if challenge:stmt=stmt.where(db.runs.c.challenge_id==challenge)
        if version:stmt=stmt.where(db.runs.c.version_id==version)
        return db.rows(c,stmt.order_by(db.runs.c.created.desc()).limit(limit))

def decorate_run(c,row,who):
    public = bool(row['published'] and not row['hidden'] and row['status']=='succeeded')
    owner=bool(who and (who['id']==row['owner_id'] or who['role']=='admin'))
    result=dict(row)
    if not owner and public:
        snap=dict(result['snapshot']);snap['skills']=[{'id':x['id'],'name':x['name'],'sha256':x['sha256']} for x in snap.get('skills',[])];result['snapshot']=snap
    vc=domain.vote_counts();votesrow=db.row(c,select(func.coalesce(vc.c.capability,0).label('capability'),func.coalesce(vc.c.funny,0).label('funny')).select_from(db.runs.outerjoin(vc,db.runs.c.id==vc.c.run_id)).where(db.runs.c.id==row['id'])) or {'capability':0,'funny':0}
    result.update(votesrow);result['my_votes']=[]
    if who:result['my_votes']=[x[0] for x in c.execute(select(db.votes.c.kind).where(db.votes.c.run_id==row['id'],db.votes.c.user_id==who['id']))]
    return result

@app.get('/api/runs/{ident}')
def get_run(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        row=domain.visible_run(c,ident,who);base=db.row(c,domain.run_query().where(db.runs.c.id==ident));return decorate_run(c,base,who)

@app.get('/api/runs/{ident}/source')
def source(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        domain.visible_run(c,ident,who);artifact=db.row(c,select(db.artifacts).where(db.artifacts.c.run_id==ident));
        if not artifact: raise HTTPException(404,'not_found')
    return {'files':artifact['files'],'sha256':artifact['sha256'],'size':artifact['size']}

@app.get('/api/runs/{ident}/preview')
def preview_link(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        run=domain.visible_run(c,ident,who);artifact=db.row(c,select(db.artifacts).where(db.artifacts.c.run_id==ident))
        if not artifact: raise HTTPException(404,'not_found')
    expires=int(db.now()+300); scope='public' if run['published'] and not run['hidden'] else ('private:'+run['owner_id'])
    token=sign(f'{ident}:{artifact["sha256"]}:{expires}:{scope}')
    return {'url':f'{settings.preview_origin}/p/{ident}/{artifact["sha256"]}/{expires}/{token}'}

@app.put('/api/runs/{ident}/publish')
def publish(ident:str,body:Publish,who=Depends(user)):
    with db.engine.begin() as c:
        row=domain.require_row(c,db.runs,ident,who['id'])
        if row['status']!='succeeded' or row['hidden']:raise HTTPException(409,'not_publishable')
        c.execute(update(db.runs).where(db.runs.c.id==ident).values(published=body.published));db.audit_log(c,who['id'],'run.publish' if body.published else 'run.unpublish',ident)
    return {'published':body.published}

@app.post('/api/runs/{ident}/cancel')
def cancel(ident:str,who=Depends(user)):
    with db.engine.begin() as c:
        row=domain.require_row(c,db.runs,ident,who['id'])
        if row['status'] in domain.ACTIVE:c.execute(update(db.runs).where(db.runs.c.id==ident).values(status='canceled',finished=db.now(),error='user_canceled'))
    return {'ok':True}

@app.put('/api/runs/{ident}/vote')
def vote(ident:str,body:Vote,who=Depends(verified_user)):
    if db.now()-who['created']<settings.vote_age:raise HTTPException(403,'vote_not_allowed')
    with db.engine.begin() as c:
        run=domain.visible_run(c,ident,who)
        if run['owner_id']==who['id'] or not run['published'] or run['hidden']:raise HTTPException(403,'vote_not_allowed')
        c.execute(delete(db.votes).where(db.votes.c.run_id==ident,db.votes.c.user_id==who['id'],db.votes.c.kind==body.kind))
        if body.active:c.execute(insert(db.votes).values(run_id=ident,user_id=who['id'],kind=body.kind,created=db.now()))
        count=c.execute(select(func.count()).select_from(db.votes).where(db.votes.c.run_id==ident,db.votes.c.kind==body.kind)).scalar_one()
    return {'count':count,'active':body.active}

@app.get('/api/leaderboard')
def leaderboard(kind:Literal['capability','funny']='capability',group:Literal['works','models']='works',challenge:str|None=None,version:str|None=None,track:Literal['standard','open','all']='standard',days:int=Query(0,ge=0,le=30),limit:int=Query(20,ge=1,le=100)):
    if days not in (0,7,30):raise HTTPException(422,'invalid_time_window')
    with db.engine.connect() as c:return {'items':domain.leaderboard(c,kind,group,challenge,version,track,days,limit)}

@app.get('/api/runs/{ident}/comments')
def comments(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        run=domain.visible_run(c,ident,who)
        if not run['published'] or run['hidden']:raise HTTPException(404,'not_found')
        return db.rows(c,select(db.comments.c.id,db.comments.c.owner_id,db.comments.c.body,db.comments.c.created,db.users.c.username).select_from(db.comments.join(db.users,db.comments.c.owner_id==db.users.c.id)).where(db.comments.c.run_id==ident,db.comments.c.hidden.is_(False)).order_by(db.comments.c.created))
@app.post('/api/runs/{ident}/comments',status_code=201)
def add_comment(ident:str,body:Comment,who=Depends(verified_user)):
    with db.engine.begin() as c:
        run=domain.visible_run(c,ident,who)
        if not run['published'] or run['hidden']:raise HTTPException(404,'not_found')
        ident2=db.uid();c.execute(insert(db.comments).values(id=ident2,owner_id=who['id'],run_id=ident,body=body.body,hidden=False,created=db.now()))
    return {'id':ident2}
@app.delete('/api/comments/{ident}')
def delete_comment(ident:str,who=Depends(user)):
    with db.engine.begin() as c:
        row=domain.require_row(c,db.comments,ident)
        if row['owner_id']!=who['id'] and who['role']!='admin':raise HTTPException(403,'owner_required')
        c.execute(delete(db.comments).where(db.comments.c.id==ident))
    return {'ok':True}

@app.post('/api/runs/{ident}/report',status_code=201)
def report(ident:str,body:Report,who=Depends(verified_user)):
    with db.engine.begin() as c:
        run=domain.visible_run(c,ident,who)
        if not run['published']:raise HTTPException(404,'not_found')
        current=db.row(c,select(db.reports).where(db.reports.c.owner_id==who['id'],db.reports.c.run_id==ident))
        if current:c.execute(update(db.reports).where(db.reports.c.id==current['id']).values(reason=body.reason,resolved=False,created=db.now()));rid=current['id']
        else:rid=db.uid();c.execute(insert(db.reports).values(id=rid,owner_id=who['id'],run_id=ident,reason=body.reason,resolved=False,created=db.now()))
    return {'id':rid}

@app.get('/api/admin/reports')
def admin_reports(_=Depends(admin)):
    with db.engine.connect() as c:return db.rows(c,select(db.reports).where(db.reports.c.resolved.is_(False)).order_by(db.reports.c.created.desc()))
@app.get('/api/admin/metrics')
def admin_metrics(_=Depends(admin)):
    with db.engine.connect() as c:
        q=db.rows(c,select(db.runs.c.status,func.count().label('count')).group_by(db.runs.c.status));a=db.rows(c,select(db.audit).order_by(db.audit.c.created.desc()).limit(100))
    return {'queue':q,'audit':a}
@app.post('/api/admin/moderate')
def moderate(body:Moderate,who=Depends(admin)):
    with db.engine.begin() as c:
        if body.action in ('hide_run','unhide_run'):
            domain.require_row(c,db.runs,body.target);c.execute(update(db.runs).where(db.runs.c.id==body.target).values(hidden=body.action=='hide_run',published=False if body.action=='hide_run' else db.runs.c.published))
        elif body.action=='archive_challenge':domain.require_row(c,db.challenges,body.target);c.execute(update(db.challenges).where(db.challenges.c.id==body.target).values(archived=True))
        elif body.action in ('suspend_user','reinstate_user'):
            target=domain.require_row(c,db.users,body.target);suspended=body.action=='suspend_user';c.execute(update(db.users).where(db.users.c.id==target['id']).values(suspended=suspended))
            if suspended:
                c.execute(delete(db.sessions).where(db.sessions.c.owner_id==target['id']));c.execute(delete(db.votes).where(db.votes.c.user_id==target['id']));c.execute(update(db.runs).where(db.runs.c.owner_id==target['id']).values(published=False,hidden=True));c.execute(update(db.runs).where(db.runs.c.owner_id==target['id'],db.runs.c.status.in_(domain.ACTIVE)).values(status='canceled',finished=db.now(),error='account_suspended'))
        elif body.action=='resolve_report':domain.require_row(c,db.reports,body.target);c.execute(update(db.reports).where(db.reports.c.id==body.target).values(resolved=True))
        db.audit_log(c,who['id'],'moderation.'+body.action,body.target)
    return {'ok':True}

@app.get('/api/runs/{ident}/events')
def event_stream(ident:str,request:Request,who=Depends(user)):
    with db.engine.connect() as c:
        run=domain.require_row(c,db.runs,ident)
        if who['id']!=run['owner_id'] and who['role']!='admin':raise HTTPException(404,'not_found')
    async def generate():
        last=0
        for _ in range(150):
            with db.engine.connect() as c:
                rows=db.rows(c,select(db.events).where(db.events.c.run_id==ident,db.events.c.id>last).order_by(db.events.c.id).limit(200));state=domain.require_row(c,db.runs,ident)
            for x in rows:
                last=x['id'];yield f"event: progress\ndata: {json.dumps(x,separators=(',',':'))}\n\n"
            if state['status'] not in domain.ACTIVE:
                yield f"event: state\ndata: {json.dumps({'status':state['status']})}\n\n";break
            if await request.is_disconnected():break
            await asyncio.sleep(0.5)
    return StreamingResponse(generate(),media_type='text/event-stream',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})

# Serve the dependency-free web UI when present.
from pathlib import Path
WEB = Path(__file__).resolve().parent.parent / 'web'
if (WEB/'art').exists(): app.mount('/assets/art',StaticFiles(directory=WEB/'art'),name='art')
@app.get('/')
def index():
    if (WEB/'index.html').exists():return FileResponse(WEB/'index.html',headers={'Cache-Control':'no-store'})
    return {'name':'TiHu','api':'/api/config'}
@app.get('/app.js')
def app_js(): return FileResponse(WEB/'dist/app.js',media_type='text/javascript')
@app.get('/style.css')
def css(): return FileResponse(WEB/'style.css',media_type='text/css')
