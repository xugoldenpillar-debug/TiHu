"""TiHu HTTP API. No provider secret is ever returned to clients."""
import asyncio
import base64
import json
import secrets
import smtplib
from email.message import EmailMessage
from typing import Literal
from urllib.parse import unquote

from fastapi import Body, Cookie, Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import and_, delete, func, insert, or_, select, update

from . import db, domain
from .config import settings
from .security import DUMMY_HASH, canonical_base, digest, discover, parse_skill, parse_uploaded_artifact, inspect_artifact_safety, password_hasher, seal, stable_hash, throttle, unseal, verify_password, sign
from .runner import validate_artifacts

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
    art: str | None = Field(default=None, max_length=2500000)


class ArtUpdate(Input):
    art: str = Field(min_length=10, max_length=2500000)

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
    action: Literal['suspend_user','reinstate_user','archive_challenge','restore_challenge','hide_run','unhide_run','resolve_report','delete_prompt']
    target: str = Field(min_length=1, max_length=100)
class AdminChallengeUpdate(Input):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=1500)
    category: str = Field(min_length=1, max_length=30)
    art: str | None = Field(default=None, max_length=2500000)
    prompt: str | None = Field(default=None, min_length=1, max_length=6000)
    rubric: str | None = Field(default=None, min_length=1, max_length=3000)
class AdminPromptUpdate(Input):
    name: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=5000)
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
            if settings.production or origin.rstrip('/') not in (settings.app_origin, 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8000', 'http://127.0.0.1:8000'):
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
    if who['suspended']: raise HTTPException(403,'account_suspended')
    if not who['verified']: raise HTTPException(403,'verification_required')
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
    with db.engine.connect() as c:
        categories=list(c.execute(select(db.challenges.c.category).where(db.challenges.c.archived.is_(False)).distinct().order_by(db.challenges.c.category)).scalars())
    return {'app_origin':settings.app_origin,'preview_origin':settings.preview_origin,'providers':settings.allowed_bases,'harness':domain.harness(),'registration':settings.registration,'vote_min_age_seconds':settings.vote_age,'categories':categories,'limits':{'skill_bytes':256*1024,'skill_files':30,'skills_per_run':4,'prompts':30,'skills':30}}

@app.get('/api/me')
def me(request:Request):
    who=session_row(request)
    if not who:return {'user':None,'csrf':None,'quota':None,'vote_eligible_at':None}
    raw=request.cookies.get(settings.cookie)
    with db.engine.connect() as c: quota=domain.quota(c,who['id'])
    return {'user':safe_user(who),'csrf':sign('csrf:'+raw),'quota':quota,'vote_eligible_at':who['created']+settings.vote_age}

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
    if who['verified']: return {'ok':True,'retry_after':0}
    throttle('verification:'+who['id'],1,60)
    with db.engine.begin() as c: token=mail_token(c,who['id'],'verify')
    try:
        sent=deliver(who['email'],'Verify your TiHu account',f'{settings.app_origin}/#/verify?token={token}')
    except (OSError,smtplib.SMTPException):
        raise HTTPException(503,'verification_delivery_failed',headers={'Retry-After':'60'}) from None
    if not sent: raise HTTPException(503,'verification_delivery_unavailable',headers={'Retry-After':'60'})
    return {'ok':True,'retry_after':60}

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
    return [{**{k:x[k] for k in ('id','label','base_url','protocol','last4','models','created')},'is_official':bool(x['base_url'] in settings.allowed_bases)} for x in rows]

@app.post('/api/keys',status_code=201)
def add_key(body:KeyInput,who=Depends(verified_user)):
    base=canonical_base(body.base_url,allow_custom=True);ident=db.uid()
    with db.engine.begin() as c:
        c.execute(insert(db.credentials).values(id=ident,owner_id=who['id'],label=body.label,base_url=base,protocol=body.protocol,sealed=seal(body.api_key,who['id'],ident),last4=body.api_key[-4:],models=[],created=db.now()))
        db.audit_log(c,who['id'],'credential.created',ident)
    return {'id':ident,'last4':body.api_key[-4:]}

@app.delete('/api/keys/{ident}')
def delete_key(ident:str,who=Depends(user)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        domain.require_row(c,db.credentials,ident,who['id'])
        canceled=c.execute(update(db.runs).where(db.runs.c.key_id==ident,db.runs.c.status.in_(domain.ACTIVE)).values(status='canceled',finished=db.now(),error='credential_revoked').returning(db.runs.c.id)).scalars().all()
        for run_id in canceled:db.log(c,run_id,'canceled','Canceled because the provider credential was revoked.')
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
    with db.engine.connect() as c:return db.rows(c,select(db.prompt_templates).where(db.prompt_templates.c.owner_id==who['id']).order_by(db.prompt_templates.c.created.desc(),db.prompt_templates.c.id).limit(30))
@app.post('/api/prompts',status_code=201)
def save_prompt(body:PromptTemplate,who=Depends(verified_user)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        if c.execute(select(func.count()).select_from(db.prompt_templates).where(db.prompt_templates.c.owner_id==who['id'])).scalar_one()>=30:raise HTTPException(422,'prompt_limit')
        ident=db.uid();c.execute(insert(db.prompt_templates).values(id=ident,owner_id=who['id'],name=body.name,body=body.body,created=db.now()))
    return {'id':ident}
@app.put('/api/prompts/{ident}')
def update_prompt(ident:str,body:PromptTemplate,who=Depends(verified_user)):
    with db.engine.begin() as c:
        domain.require_row(c,db.prompt_templates,ident,who['id'])
        c.execute(update(db.prompt_templates).where(db.prompt_templates.c.id==ident).values(name=body.name,body=body.body))
    return {'id':ident}
@app.delete('/api/prompts/{ident}')
def del_prompt(ident:str,who=Depends(user)):
    with db.engine.begin() as c:domain.require_row(c,db.prompt_templates,ident,who['id']);c.execute(delete(db.prompt_templates).where(db.prompt_templates.c.id==ident))
    return {'ok':True}

@app.get('/api/skills')
def list_skills(who=Depends(user)):
    with db.engine.connect() as c:
        current=select(func.max(db.skill_versions.c.number)).where(db.skill_versions.c.skill_id==db.skills.c.id).scalar_subquery()
        rows=db.rows(c,select(db.skills,current.label('current_version')).where(db.skills.c.owner_id==who['id']).order_by(db.skills.c.created.desc(),db.skills.c.id))
    return [{**{k:x[k] for k in ('id','name','sha256','created','current_version')},'file_count':len(x['files'])} for x in rows]

@app.get('/api/skills/{ident}')
def skill_detail(ident:str,version:int|None=Query(None,ge=1),who=Depends(user)):
    with db.engine.connect() as c:
        skill=domain.require_row(c,db.skills,ident,who['id'])
        versions=db.rows(c,select(db.skill_versions.c.number,db.skill_versions.c.sha256,db.skill_versions.c.created).where(db.skill_versions.c.skill_id==ident).order_by(db.skill_versions.c.number.desc()))
        current=versions[0]['number']
        revision=db.row(c,select(db.skill_versions).where(db.skill_versions.c.skill_id==ident,db.skill_versions.c.number==(version or current)))
        if not revision: raise HTTPException(404,'not_found')
    return {'id':ident,'name':skill['name'],'sha256':revision['sha256'],'current_version':current,'version':revision['number'],'files':revision['files'],'versions':versions}

def persist_skill(c,ident,who,name,files):
    domain.admission_lock(c)
    sha=stable_hash(files);created=db.now();name=unquote(name).strip()[:80]
    if not name: raise HTTPException(422,'skill_name_required')
    if ident:
        domain.require_row(c,db.skills,ident,who['id'])
        number=c.execute(select(func.max(db.skill_versions.c.number)).where(db.skill_versions.c.skill_id==ident)).scalar_one()+1
        c.execute(update(db.skills).where(db.skills.c.id==ident).values(name=name,files=files,sha256=sha))
    else:
        if c.execute(select(func.count()).select_from(db.skills).where(db.skills.c.owner_id==who['id'])).scalar_one()>=30:raise HTTPException(422,'skill_limit')
        ident=db.uid();number=1
        c.execute(insert(db.skills).values(id=ident,owner_id=who['id'],name=name,files=files,sha256=sha,created=created))
    c.execute(insert(db.skill_versions).values(skill_id=ident,number=number,files=files,sha256=sha,created=created))
    return {'id':ident,'current_version':number,'sha256':sha}

@app.post('/api/skills',status_code=201)
async def add_skill(request:Request,x_file_name:str=Header('SKILL.md'),x_skill_name:str=Header('Skill'),who=Depends(verified_user)):
    files=parse_skill(unquote(x_file_name),await request.body())
    with db.engine.begin() as c:return persist_skill(c,None,who,x_skill_name,files)

@app.put('/api/skills/{ident}')
async def update_skill(ident:str,request:Request,x_file_name:str=Header('SKILL.md'),x_skill_name:str=Header('Skill'),who=Depends(verified_user)):
    files=parse_skill(unquote(x_file_name),await request.body())
    with db.engine.begin() as c:return persist_skill(c,ident,who,x_skill_name,files)

@app.delete('/api/skills/{ident}')
def del_skill(ident:str,who=Depends(user)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        domain.require_row(c,db.skills,ident,who['id'])
        c.execute(delete(db.skill_versions).where(db.skill_versions.c.skill_id==ident))
        c.execute(delete(db.skills).where(db.skills.c.id==ident))
    return {'ok':True}


@app.get('/api/challenges')
def challenges(q:str=Query('',max_length=200),category:str|None=None,cursor:str|None=Query(None,max_length=512),limit:int=Query(50,ge=1,le=100)):
    with db.engine.connect() as c:
        stmt=select(db.challenges).where(db.challenges.c.archived.is_(False))
        if q.strip():stmt=stmt.where(or_(db.challenges.c.title.icontains(q.strip(),autoescape=True),db.challenges.c.description.icontains(q.strip(),autoescape=True)))
        if category:stmt=stmt.where(db.challenges.c.category==category)
        return domain.paginate(c,stmt,db.challenges.c.created,db.challenges.c.id,cursor,limit)

@app.get('/api/challenges/{ident}')
def challenge_detail(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        row=domain.require_row(c,db.challenges,ident);row['versions']=db.rows(c,select(db.versions).where(db.versions.c.challenge_id==ident).order_by(db.versions.c.number.desc()))
        row['can_edit']=bool(who and who['verified'] and (who['id']==row['owner_id'] or who['role']=='admin'))
    return row

@app.post('/api/challenges',status_code=201)
def create_challenge(body:Challenge,who=Depends(verified_user)):
    ident=db.uid();vid=db.uid();prompt=body.prompt.strip();rubric=body.rubric.strip()
    with db.engine.begin() as c:
        c.execute(insert(db.challenges).values(id=ident,owner_id=who['id'],title=body.title,description=body.description,category=body.category,current_version=1,archived=False,art=body.art,created=db.now()))
        c.execute(insert(db.versions).values(id=vid,challenge_id=ident,number=1,prompt=prompt,rubric=rubric,sha256=stable_hash({'prompt':prompt,'rubric':rubric}),created=db.now()))
    return {'id':ident,'version_id':vid}

@app.put('/api/challenges/{ident}/art')
def update_challenge_art(ident:str,body:ArtUpdate,who=Depends(verified_user)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        task=domain.require_row(c,db.challenges,ident)
        if task['owner_id']!=who['id'] and who['role']!='admin':raise HTTPException(403,'owner_required')
        c.execute(update(db.challenges).where(db.challenges.c.id==ident).values(art=body.art))
    return {'ok':True,'art':body.art}

@app.post('/api/challenges/{ident}/versions',status_code=201)
def create_version(ident:str,body:VersionInput,who=Depends(verified_user)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        task=domain.require_row(c,db.challenges,ident)
        if task['owner_id']!=who['id'] and who['role']!='admin':raise HTTPException(403,'owner_required')
        number=c.execute(select(func.max(db.versions.c.number)).where(db.versions.c.challenge_id==ident)).scalar_one()+1;vid=db.uid();p=body.prompt.strip();r=body.rubric.strip()
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

async def process_artifact_safety(ident: str, owner_id: str, files: dict[str, str]):
    await asyncio.sleep(0.05)
    try:
        safe, reason = inspect_artifact_safety(files)
        if not safe:
            with db.engine.begin() as c:
                c.execute(update(db.runs).where(db.runs.c.id == ident).values(status='failed', finished=db.now(), error='unsafe_artifact'))
                db.log(c, ident, 'failed', f'安全审计未通过：{reason}')
            return
        size = validate_artifacts(files)
        sha = stable_hash(files)
        with db.engine.begin() as c:
            c.execute(db.artifacts.insert().values(run_id=ident, files=files, sha256=sha, size=size))
            c.execute(update(db.runs).where(db.runs.c.id == ident).values(status='succeeded', finished=db.now()))
            db.log(c, ident, 'succeeded', '安全审计通过，作品产物已私密保存。')
            # Artifact and run successfully validated and saved
        try:
            from . import thumbnails
            await thumbnails.capture(ident, files)
        except Exception:
            pass
    except Exception:
        with db.engine.begin() as c:
            c.execute(update(db.runs).where(db.runs.c.id == ident).values(status='failed', finished=db.now(), error='safety_check_failed'))
            db.log(c, ident, 'failed', '处理作品时发生系统异常。')

@app.post('/api/runs/upload', status_code=201)
async def upload_run(
    request: Request,
    challenge_id: str = Form(None),
    version_id: str | None = Form(None),
    title: str | None = Form(None),
    file: UploadFile | None = File(None),
    x_challenge_id: str | None = Header(None, alias='X-Challenge-Id'),
    x_version_id: str | None = Header(None, alias='X-Version-Id'),
    x_file_name: str | None = Header(None, alias='X-File-Name'),
    x_run_title: str | None = Header(None, alias='X-Run-Title'),
    who = Depends(verified_user),
):
    cid = challenge_id or x_challenge_id
    if not cid:
        raise HTTPException(422, 'challenge_id_required')
    vid = version_id or x_version_id
    raw_title = title or x_run_title

    if file is not None:
        content = await file.read()
        filename = file.filename or 'index.html'
    else:
        content = await request.body()
        filename = unquote(x_file_name or 'index.html')

    files = parse_uploaded_artifact(filename, content)

    with db.engine.begin() as c:
        domain.admission_lock(c)
        ch = db.row(c, select(db.challenges).where(db.challenges.c.id == cid, db.challenges.c.archived.is_(False)))
        if not ch:
            raise HTTPException(404, 'challenge_not_found')
        if vid:
            ver = db.row(c, select(db.versions).where(db.versions.c.id == vid, db.versions.c.challenge_id == ch['id']))
            if not ver:
                raise HTTPException(404, 'version_not_found')
        else:
            ver = db.row(c, select(db.versions).where(db.versions.c.challenge_id == ch['id'], db.versions.c.number == ch['current_version']))
            if not ver:
                raise HTTPException(404, 'version_not_found')

        ident = db.uid()
        run_title = (raw_title or ch['title']).strip()[:100]
        snapshot = {
            'challenge_prompt': ver['prompt'],
            'rubric': ver['rubric'],
            'version_hash': ver['sha256'],
            'source': 'upload',
            'filename': filename,
            'title': run_title,
            'harness': domain.harness(),
        }
        environment = stable_hash(snapshot['harness'])
        c.execute(insert(db.runs).values(
            id=ident,
            owner_id=who['id'],
            challenge_id=ch['id'],
            version_id=ver['id'],
            model='用户自制作品',
            provider='user:upload',
            track='custom',
            environment=environment,
            status='running',
            snapshot=snapshot,
            fingerprint=stable_hash({'upload': ident, 'owner': who['id']}),
            idempotency=ident,
            created=db.now(),
            started=db.now(),
        ))
        db.log(c, ident, 'queued', '作品已接收，正在提交后台异步安全审计与沙箱隔离预检…')
        db.audit_log(c, who['id'], 'run.uploaded', ident)

    asyncio.create_task(process_artifact_safety(ident, who['id'], files))
    return {
        'id': ident,
        'status': 'running',
        'message': '作品已接收，正在异步进行安全审计与隔离检查',
    }

@app.get('/api/runs')
def list_runs(challenge:str|None=None,version:str|None=None,mine:bool=False,track:Literal['all','standard','open']='all',status:Literal['all','queued','running','succeeded','failed','canceled']='all',published:Literal['all','public','private']='all',q:str=Query('',max_length=200),cursor:str|None=Query(None,max_length=512),limit:int=Query(24,ge=1,le=100),who=Depends(optional_user)):
    with db.engine.connect() as c:
        stmt=domain.run_query()
        if mine:
            if not who:raise HTTPException(401,'authentication_required')
            stmt=stmt.where(db.runs.c.owner_id==who['id'])
        else:stmt=stmt.where(*domain.public_conditions(track='all',latest=False))
        if challenge:stmt=stmt.where(db.runs.c.challenge_id==challenge)
        if version:stmt=stmt.where(db.runs.c.version_id==version)
        if track!='all':stmt=stmt.where(db.runs.c.track==track)
        if status!='all':stmt=stmt.where(db.runs.c.status==status)
        if published!='all':stmt=stmt.where(db.runs.c.published.is_(published=='public'))
        if q.strip():stmt=stmt.where(or_(*[column.icontains(q.strip(),autoescape=True) for column in (db.challenges.c.title,db.runs.c.model,db.runs.c.provider,db.users.c.username)]))
        page=domain.paginate(c,stmt,db.runs.c.created,db.runs.c.id,cursor,limit,descending=True)
        domain.decorate_summaries(c,page['items'],who)
        return page

def decorate_run(c,row,who):
    owner=bool(who and who['id']==row['owner_id'])
    result=domain.decorate_summaries(c,[dict(row)],who)[0]
    if not owner:
        snap=dict(result['snapshot']);snap['skills']=[{k:x[k] for k in ('id','name','sha256') if k in x} for x in snap.get('skills',[])];result['snapshot']=snap
    result['can_view_events']=bool(owner or (who and who['role']=='admin'))
    result['vote_reason']=domain.vote_reason(row,who)
    result['can_vote']=result['vote_reason'] is None
    return result

@app.get('/api/runs/{ident}')
def get_run(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        domain.visible_run(c,ident,who);base=db.row(c,domain.run_query(detail=True).where(db.runs.c.id==ident));return decorate_run(c,base,who)

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
    return {'url':f'{settings.preview_origin}/p/{ident}/{artifact["sha256"]}/{expires}/{token}/index.html','expires':expires}

@app.get('/api/runs/{ident}/thumbnail')
def thumbnail(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        domain.visible_run(c,ident,who)
        data=c.execute(select(db.thumbnails.c.data).where(db.thumbnails.c.run_id==ident)).scalar_one_or_none()
    if data is None: raise HTTPException(404,'not_found')
    return Response(data,media_type='image/jpeg',headers={'Cache-Control':'no-store'})

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
        domain.require_row(c,db.runs,ident,who['id'])
        changed=c.execute(update(db.runs).where(db.runs.c.id==ident,db.runs.c.status.in_(domain.ACTIVE)).values(status='canceled',finished=db.now(),error='user_canceled')).rowcount
        if changed:
            db.log(c,ident,'canceled','Canceled by the owner. In-flight provider usage may still be billed.')
            db.audit_log(c,who['id'],'run.cancel',ident)
    return {'ok':True}
@app.delete('/api/runs/{ident}')
def delete_run(ident:str,who=Depends(user)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        run=domain.require_row(c,db.runs,ident)
        if run['owner_id']!=who['id'] and who['role']!='admin':raise HTTPException(403,'forbidden')
        if run['status'] in domain.ACTIVE:raise HTTPException(409,'cannot_delete_active_run')
        c.execute(delete(db.artifacts).where(db.artifacts.c.run_id==ident))
        c.execute(delete(db.thumbnails).where(db.thumbnails.c.run_id==ident))
        c.execute(delete(db.events).where(db.events.c.run_id==ident))
        c.execute(delete(db.votes).where(db.votes.c.run_id==ident))
        c.execute(delete(db.comments).where(db.comments.c.run_id==ident))
        c.execute(delete(db.reports).where(db.reports.c.run_id==ident))
        c.execute(delete(db.runs).where(db.runs.c.id==ident))
        db.audit_log(c,who['id'],'run.deleted',ident)
    return {'ok':True}

@app.put('/api/runs/{ident}/vote')
def vote(ident:str,body:Vote,who=Depends(verified_user)):
    if db.now()-who['created']<settings.vote_age:raise HTTPException(403,'account_too_new')
    with db.engine.begin() as c:
        domain.admission_lock(c)
        run=domain.visible_run(c,ident,who)
        reason=domain.vote_reason(run,who)
        if reason:raise HTTPException(403,reason)
        c.execute(delete(db.votes).where(db.votes.c.run_id==ident,db.votes.c.user_id==who['id'],db.votes.c.kind==body.kind))
        if body.active:c.execute(insert(db.votes).values(run_id=ident,user_id=who['id'],kind=body.kind,created=db.now()))
        count=c.execute(select(func.count()).select_from(db.votes).where(db.votes.c.run_id==ident,db.votes.c.kind==body.kind)).scalar_one()
    return {'count':count,'active':body.active}

@app.get('/api/leaderboard')
def leaderboard(kind:Literal['capability','funny']='capability',group:Literal['works','models']='works',challenge:str|None=None,version:str|None=None,track:Literal['standard','open','all']='standard',provider_scope:Literal['all','official','custom']='all',days:int=Query(0,ge=0,le=30),limit:int=Query(20,ge=1,le=100),environment:str|None=Query(None,pattern=r'^[a-f0-9]{64}$'),who=Depends(optional_user)):
    if days not in (0,7,30):raise HTTPException(422,'invalid_time_window')
    environment=environment or stable_hash(domain.harness())
    with db.engine.connect() as c:
        items=domain.leaderboard(c,kind,group,challenge,version,track,days,limit,environment,provider_scope=provider_scope)
        if group=='works':domain.decorate_summaries(c,items,who)
    return {'items':items,'basis':{'time':'work_created','days':days,'environment':environment,'version':version or 'latest_per_challenge','provider_scope':provider_scope,'model_aggregation':'best_work_per_author_challenge_version_provider_model_track_environment'}}

@app.get('/api/runs/{ident}/comments')
def comments(ident:str,who=Depends(optional_user)):
    with db.engine.connect() as c:
        run=domain.visible_run(c,ident,who)
        rows=db.rows(c,select(db.comments.c.id,db.comments.c.owner_id,db.comments.c.body,db.comments.c.created,db.users.c.username).select_from(db.comments.join(db.users,db.comments.c.owner_id==db.users.c.id)).where(db.comments.c.run_id==ident,db.comments.c.hidden.is_(False)).order_by(db.comments.c.created,db.comments.c.id))
        for row in rows:row['can_delete']=bool(who and (who['id'] in (row['owner_id'],run['owner_id']) or who['role']=='admin'))
        return rows
@app.post('/api/runs/{ident}/comments',status_code=201)
def add_comment(ident:str,body:Comment,who=Depends(verified_user)):
    with db.engine.begin() as c:
        run=domain.visible_run(c,ident,who)
        if not run['published'] or run['hidden'] or run['status']!='succeeded':raise HTTPException(404,'not_found')
        ident2=db.uid();c.execute(insert(db.comments).values(id=ident2,owner_id=who['id'],run_id=ident,body=body.body,hidden=False,created=db.now()))
    return {'id':ident2}
@app.delete('/api/comments/{ident}')
def delete_comment(ident:str,who=Depends(user)):
    with db.engine.begin() as c:
        row=domain.require_row(c,db.comments,ident)
        run=domain.require_row(c,db.runs,row['run_id'])
        if who['id'] not in (row['owner_id'],run['owner_id']) and who['role']!='admin':raise HTTPException(403,'owner_required')
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
        domain.admission_lock(c)
        if body.action in ('hide_run','unhide_run'):
            domain.require_row(c,db.runs,body.target);c.execute(update(db.runs).where(db.runs.c.id==body.target).values(hidden=body.action=='hide_run',published=False if body.action=='hide_run' else db.runs.c.published))
        elif body.action in ('archive_challenge','restore_challenge'):
            domain.require_row(c,db.challenges,body.target);c.execute(update(db.challenges).where(db.challenges.c.id==body.target).values(archived=body.action=='archive_challenge'))
        elif body.action in ('suspend_user','reinstate_user'):
            if body.action=='suspend_user' and body.target==who['id']:raise HTTPException(400,'cannot_suspend_self')
            target=domain.require_row(c,db.users,body.target);suspended=body.action=='suspend_user';c.execute(update(db.users).where(db.users.c.id==target['id']).values(suspended=suspended))
            if suspended:
                c.execute(delete(db.sessions).where(db.sessions.c.owner_id==target['id']));c.execute(delete(db.votes).where(db.votes.c.user_id==target['id']));c.execute(update(db.runs).where(db.runs.c.owner_id==target['id']).values(published=False,hidden=True))
                c.execute(update(db.comments).where(db.comments.c.owner_id==target['id']).values(hidden=True))
                canceled=c.execute(update(db.runs).where(db.runs.c.owner_id==target['id'],db.runs.c.status.in_(domain.ACTIVE)).values(status='canceled',finished=db.now(),error='account_suspended').returning(db.runs.c.id)).scalars().all()
                for run_id in canceled:db.log(c,run_id,'canceled','Canceled because the account was suspended.')
        elif body.action=='resolve_report':domain.require_row(c,db.reports,body.target);c.execute(update(db.reports).where(db.reports.c.id==body.target).values(resolved=True))
        elif body.action=='delete_prompt':
            domain.require_row(c,db.prompt_templates,body.target);c.execute(delete(db.prompt_templates).where(db.prompt_templates.c.id==body.target))
        db.audit_log(c,who['id'],'moderation.'+body.action,body.target)
    return {'ok':True}

@app.get('/api/admin/users')
def admin_users(q:str=Query('',max_length=200),suspended:bool|None=None,limit:int=Query(50,ge=1,le=100),_=Depends(admin)):
    with db.engine.connect() as c:
        stmt=select(db.users.c.id,db.users.c.username,db.users.c.email,db.users.c.role,db.users.c.verified,db.users.c.suspended,db.users.c.created)
        if q.strip():
            term=f"%{q.strip()}%"
            stmt=stmt.where(or_(db.users.c.username.ilike(term),db.users.c.email.ilike(term)))
        if suspended is not None:stmt=stmt.where(db.users.c.suspended==suspended)
        return db.rows(c,stmt.order_by(db.users.c.created.desc()).limit(limit))

@app.get('/api/admin/challenges')
def admin_challenges(q:str=Query('',max_length=200),archived:bool|None=None,limit:int=Query(50,ge=1,le=100),_=Depends(admin)):
    with db.engine.connect() as c:
        stmt=select(
            db.challenges.c.id,db.challenges.c.title,db.challenges.c.description,db.challenges.c.category,
            db.challenges.c.current_version,db.challenges.c.archived,db.challenges.c.art,db.challenges.c.created,
            db.users.c.username.label('author'),db.versions.c.prompt,db.versions.c.rubric
        ).join(db.users,db.challenges.c.owner_id==db.users.c.id).join(
            db.versions,and_(db.versions.c.challenge_id==db.challenges.c.id,db.versions.c.number==db.challenges.c.current_version)
        )
        if q.strip():stmt=stmt.where(db.challenges.c.title.ilike(f"%{q.strip()}%"))
        if archived is not None:stmt=stmt.where(db.challenges.c.archived==archived)
        return db.rows(c,stmt.order_by(db.challenges.c.created.desc()).limit(limit))

@app.put('/api/admin/challenges/{ident}')
def admin_update_challenge(ident:str,body:AdminChallengeUpdate,who=Depends(admin)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        task=domain.require_row(c,db.challenges,ident)
        vals={'title':body.title.strip(),'description':body.description.strip(),'category':body.category.strip()}
        if body.art is not None: vals['art']=body.art.strip() or None
        c.execute(update(db.challenges).where(db.challenges.c.id==ident).values(**vals))
        if body.prompt is not None and body.rubric is not None:
            p=body.prompt.strip();r=body.rubric.strip()
            c.execute(update(db.versions).where(db.versions.c.challenge_id==ident,db.versions.c.number==task['current_version']).values(prompt=p,rubric=r,sha256=stable_hash({'prompt':p,'rubric':r})))
        db.audit_log(c,who['id'],'challenge.updated',ident)
    return {'ok':True}

@app.delete('/api/admin/challenges/{ident}')
def admin_delete_challenge(ident:str,who=Depends(admin)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        domain.require_row(c,db.challenges,ident)
        run_ids=list(c.execute(select(db.runs.c.id).where(db.runs.c.challenge_id==ident)).scalars().all())
        if run_ids:
            c.execute(delete(db.artifacts).where(db.artifacts.c.run_id.in_(run_ids)))
            c.execute(delete(db.thumbnails).where(db.thumbnails.c.run_id.in_(run_ids)))
            c.execute(delete(db.events).where(db.events.c.run_id.in_(run_ids)))
            c.execute(delete(db.votes).where(db.votes.c.run_id.in_(run_ids)))
            c.execute(delete(db.comments).where(db.comments.c.run_id.in_(run_ids)))
            c.execute(delete(db.reports).where(db.reports.c.run_id.in_(run_ids)))
            c.execute(delete(db.runs).where(db.runs.c.challenge_id==ident))
        c.execute(delete(db.versions).where(db.versions.c.challenge_id==ident))
        c.execute(delete(db.challenges).where(db.challenges.c.id==ident))
        db.audit_log(c,who['id'],'challenge.deleted',ident)
    return {'ok':True}

@app.get('/api/admin/prompts')
def admin_prompts(q:str=Query('',max_length=200),limit:int=Query(50,ge=1,le=100),_=Depends(admin)):
    with db.engine.connect() as c:
        stmt=select(db.prompt_templates.c.id,db.prompt_templates.c.owner_id,db.prompt_templates.c.name,db.prompt_templates.c.body,db.prompt_templates.c.created,db.users.c.username.label('author')).join(db.users,db.prompt_templates.c.owner_id==db.users.c.id)
        if q.strip():
            term=f"%{q.strip()}%"
            stmt=stmt.where(or_(db.prompt_templates.c.name.ilike(term),db.prompt_templates.c.body.ilike(term)))
        return db.rows(c,stmt.order_by(db.prompt_templates.c.created.desc()).limit(limit))

@app.put('/api/admin/prompts/{ident}')
def admin_update_prompt(ident:str,body:AdminPromptUpdate,who=Depends(admin)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        domain.require_row(c,db.prompt_templates,ident)
        c.execute(update(db.prompt_templates).where(db.prompt_templates.c.id==ident).values(name=body.name.strip(),body=body.body.strip()))
        db.audit_log(c,who['id'],'prompt.updated',ident)
    return {'ok':True}

@app.delete('/api/admin/prompts/{ident}')
def admin_delete_prompt(ident:str,who=Depends(admin)):
    with db.engine.begin() as c:
        domain.admission_lock(c)
        domain.require_row(c,db.prompt_templates,ident)
        c.execute(delete(db.prompt_templates).where(db.prompt_templates.c.id==ident))
        db.audit_log(c,who['id'],'prompt.deleted',ident)
    return {'ok':True}

@app.get('/api/runs/{ident}/events')
def event_stream(ident:str,request:Request,after:int=Query(0,ge=0,le=2**63-1),last_event_id:str|None=Header(None,alias='Last-Event-ID'),who=Depends(user)):
    with db.engine.connect() as c:
        run=domain.require_row(c,db.runs,ident)
        if who['id']!=run['owner_id'] and who['role']!='admin':raise HTTPException(404,'not_found')
    if last_event_id is not None:
        try:
            resumed=int(last_event_id)
            if not 0<=resumed<=2**63-1:raise ValueError()
        except ValueError:raise HTTPException(422,'invalid_event_id') from None
        after=max(after,resumed)
    async def generate():
        last=after;idle=0
        while idle<150:
            if await request.is_disconnected():break
            current=session_row(request)
            if not current or (current['id']!=run['owner_id'] and current['role']!='admin'):break
            with db.engine.connect() as c:
                state=domain.require_row(c,db.runs,ident)
                rows=db.rows(c,select(db.events).where(db.events.c.run_id==ident,db.events.c.id>last).order_by(db.events.c.id).limit(200))
            for x in rows:
                last=x['id'];yield f"id: {last}\nevent: progress\ndata: {json.dumps(x,separators=(',',':'))}\n\n"
            if len(rows)==200:continue
            if state['status'] not in domain.ACTIVE:
                yield f"event: state\ndata: {json.dumps({'status':state['status']})}\n\n";break
            idle+=1
            await asyncio.sleep(0.5)
    return StreamingResponse(generate(),media_type='text/event-stream',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})

# Serve the dependency-free web UI when present.
from pathlib import Path
WEB = Path(__file__).resolve().parent.parent / 'web'
if (WEB/'art').exists(): app.mount('/art',StaticFiles(directory=WEB/'art'),name='art')
app.mount('/dist',StaticFiles(directory=WEB/'dist',check_dir=False),name='dist')
@app.get('/')
def index():
    if (WEB/'index.html').exists():return FileResponse(WEB/'index.html',headers={'Cache-Control':'no-store'})
    return {'name':'TiHu','api':'/api/config'}
@app.get('/style.css')
def css(): return FileResponse(WEB/'style.css',media_type='text/css')
