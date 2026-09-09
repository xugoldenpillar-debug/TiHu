"""Worker, single-run credential broker, and sandbox lifecycle."""
import asyncio
import base64
import json
import logging
import os
import re
import secrets
import shutil
import tempfile
from pathlib import Path
from aiohttp import web
from sqlalchemy import select, update

from . import db, domain
from .config import settings
from .security import auth_headers, outbound_session, safe_path, unseal, stable_hash

logger=logging.getLogger('tihu.runner')
TERMINAL=('succeeded','failed','canceled')
LEASE_SECONDS=60


def claim():
    """Claim one run. PostgreSQL workers use SKIP LOCKED; SQLite tests serialize."""
    with db.engine.begin() as c:
        if c.dialect.name=='sqlite':
            try:c.exec_driver_sql('BEGIN IMMEDIATE')
            except Exception:pass
            stmt=select(db.runs).where(db.runs.c.status=='queued').order_by(db.runs.c.created).limit(1)
        else:
            stmt=select(db.runs).where(db.runs.c.status=='queued').order_by(db.runs.c.created).with_for_update(skip_locked=True).limit(1)
        run=db.row(c,stmt)
        if not run:return None
        lease=secrets.token_hex(16);now=db.now()
        changed=c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='queued').values(status='running',lease=lease,heartbeat=now,started=now)).rowcount
        if not changed:return None
        db.log(c,run['id'],'started','Starting a fresh sandbox. Extensions, hooks and external network are disabled.')
        run.update(status='running',lease=lease,heartbeat=now,started=now)
        return run


def heartbeat(run):
    with db.engine.begin() as c:
        return bool(c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='running',db.runs.c.lease==run['lease']).values(heartbeat=db.now())).rowcount)


def still_active(run):
    with db.engine.connect() as c:
        return c.execute(select(db.runs.c.id).where(db.runs.c.id==run['id'],db.runs.c.status=='running',db.runs.c.lease==run['lease'])).first() is not None


def reap_stale():
    cutoff=db.now()-LEASE_SECONDS
    with db.engine.begin() as c:
        stale=db.rows(c,select(db.runs).where(db.runs.c.status=='running',db.runs.c.heartbeat<cutoff))
        for run in stale:
            c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='running',db.runs.c.lease==run['lease']).values(status='failed',finished=db.now(),error='worker_lease_expired_no_automatic_retry'))
            db.log(c,run['id'],'failed','Worker lease expired. This paid job will not be retried automatically.')
    return len(stale)


def constrain_payload(raw, snapshot):
    """Make provider requests narrower than whatever the guest attempted to send."""
    if not isinstance(raw,dict):raise ValueError('json_object_required')
    if raw.get('model') not in (None,snapshot['model']):raise ValueError('model_switch_denied')
    common={'model','stream','temperature','top_p','tools','tool_choice'}
    supported={
        'openai':{'messages','stream_options','max_tokens','max_completion_tokens','n','stop','parallel_tool_calls','reasoning_effort','reasoning','store'},
        'responses':{'input','instructions','max_output_tokens','parallel_tool_calls','reasoning','text','store','include'},
        'anthropic':{'messages','system','max_tokens','stop_sequences','thinking','output_config','metadata'},
    }
    protocol=snapshot['protocol']; payload={k:v for k,v in raw.items() if k in common|supported[protocol]};payload['model']=snapshot['model']
    if snapshot.get('thinking','off')=='off':
        for field in ('reasoning','reasoning_effort','thinking','output_config'):payload.pop(field,None)
    tools=payload.get('tools',[])
    for tool in tools:
        if not isinstance(tool,dict):raise ValueError('tool_denied')
        if tool.get('type')!='function':raise ValueError('hosted_tool_denied')
        function=tool.get('function',{})
        if function.get('name') in ('remote_mcp','web_search','computer','shell'):raise ValueError('remote_tool_denied')
    def check_content(value,depth=0):
        if depth>30:raise ValueError('input_too_deep')
        if isinstance(value,dict):
            if value.get('type') in ('input_image','image_url','input_file','file','image','document'):raise ValueError('only_text_inputs_allowed')
            if any(k in value for k in ('image_url','file_url','url')) and value.get('type') not in (None,'text','input_text'):raise ValueError('remote_input_denied')
            for child in value.values():check_content(child,depth+1)
        elif isinstance(value,list):
            for child in value:check_content(child,depth+1)
    check_content(payload.get('messages',payload.get('input',[])))
    limit=snapshot['harness']['output_tokens_per_call']
    if protocol=='openai':
        payload.pop('max_tokens',None);payload['max_completion_tokens']=limit;payload['n']=1
    elif protocol=='responses':payload['max_output_tokens']=limit
    else:
        payload['max_tokens']=limit
        if isinstance(payload.get('thinking'),dict) and payload['thinking'].get('type')=='enabled':payload['thinking']['budget_tokens']=max(256,min(limit-1,limit//2))
    return payload


def validate_artifacts(files):
    if not isinstance(files,dict) or 'index.html' not in files or not 1<=len(files)<=50:raise ValueError('index_html_required')
    total=0
    for path,encoded in files.items():
        if not isinstance(path,str) or not safe_path(path) or not isinstance(encoded,str):raise ValueError('unsafe_artifact')
        if Path(path).suffix.lower() not in {'.html','.css','.js','.mjs','.json','.txt','.svg','.png','.jpg','.jpeg','.webp'}:raise ValueError('artifact_type_denied')
        try:data=base64.b64decode(encoded,validate=True)
        except Exception:raise ValueError('invalid_artifact_encoding') from None
        if len(data)>512*1024:raise ValueError('artifact_file_too_large')
        total+=len(data)
    if total>2*1024*1024:raise ValueError('artifact_bundle_too_large')
    return total


class Broker:
    def __init__(self,run,key):self.run=run;self.key=key;self.token=secrets.token_urlsafe(32);self.calls=0
    async def handle(self,request):
        if request.headers.get('authorization')!=f'Bearer {self.token}' and request.headers.get('x-api-key')!=self.token:return web.json_response({'error':'unauthorized'},status=401)
        if not still_active(self.run):return web.json_response({'error':'run_inactive'},status=409)
        if self.calls>=self.run['snapshot']['harness']['calls']:return web.json_response({'error':'model_call_limit'},status=429)
        if request.method!='POST':return web.json_response({'error':'method_denied'},status=405)
        try:
            raw=await request.json();payload=constrain_payload(raw,self.run['snapshot'])
        except (ValueError,TypeError,AttributeError,RecursionError,OverflowError,json.JSONDecodeError) as exc:return web.json_response({'error':str(exc)[:100]},status=422)
        protocol=self.run['snapshot']['protocol'];base=self.run['snapshot']['base_url']
        suffix={'openai':'/chat/completions','responses':'/responses','anthropic':'/messages'}[protocol]
        self.calls+=1
        headers=auth_headers(protocol,self.key);headers['content-type']='application/json'
        try:
            async with outbound_session() as client:
                async with client.post(base+suffix,headers=headers,json=payload,allow_redirects=False) as response:
                    if response.content_length and response.content_length>4*1024*1024:return web.json_response({'error':'provider_response_too_large'},status=502)
                    body=await response.read()
                    if len(body)>4*1024*1024:return web.json_response({'error':'provider_response_too_large'},status=502)
                    content_type=response.headers.get('content-type','application/json').split(';')[0]
                    return web.Response(body=body,status=response.status,content_type=content_type)
        except Exception:
            return web.json_response({'error':'provider_request_failed'},status=502)


def docker_command(run,socket_dir,image_id):
    name=f"tihu-{run['id']}-{run['lease'][:8]}"
    return ['docker','run','--rm','-i','--name',name,'--label','tihu.managed=true','--label',f"tihu.run={run['id']}",
            '--runtime',settings.sandbox_runtime,'--network','none','--read-only','--user','65532:65532',
            '--cap-drop','ALL','--security-opt','no-new-privileges=true','--pids-limit','96','--memory','512m','--memory-swap','512m','--cpus','1',
            '--ulimit','nofile=128:128','--ulimit','core=0','--log-driver','none',
            '--tmpfs','/workspace:rw,nosuid,nodev,size=64m,mode=1777','--tmpfs','/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777',
            '--mount',f'type=bind,source={socket_dir},target=/broker,readonly',image_id]


async def command(*args,timeout=10):
    proc=await asyncio.create_subprocess_exec(*args,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
    try:
        out,_=await asyncio.wait_for(proc.communicate(),timeout)
        if proc.returncode:raise RuntimeError('container_command_failed')
        return out.decode().strip()
    except asyncio.TimeoutError:
        proc.kill();await proc.wait();raise RuntimeError('container_command_timeout') from None

async def image_id():
    value=await command('docker','image','inspect',settings.sandbox_image,'--format','{{.Id}}')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}',value):raise RuntimeError('untrusted_sandbox_image')
    return value

async def remove_container(name):
    try:await command('docker','rm','-f',name)
    except (OSError,RuntimeError):logger.warning('Container cleanup failed for %s',name)

async def sweep_orphans():
    try:
        names=(await command('docker','ps','-a','--filter','label=tihu.managed=true','--format','{{.Names}}')).splitlines()
        for name in names:
            match=re.fullmatch(r'tihu-([a-f0-9]{32})-([a-f0-9]{8})',name)
            if not match:continue
            with db.engine.connect() as c:active=c.execute(select(db.runs.c.id).where(db.runs.c.id==match.group(1),db.runs.c.status=='running')).first()
            if not active:await remove_container(name)
    except (OSError,RuntimeError):logger.warning('Orphan sweep skipped')


def output_files_from_workspace(workspace):
    files={}
    for path in Path(workspace).rglob('*'):
        if path.is_file() and not path.is_symlink():
            rel=path.relative_to(workspace).as_posix()
            if not safe_path(rel):raise ValueError('unsafe_artifact_path')
            data=path.read_bytes();files[rel]=base64.b64encode(data).decode()
    validate_artifacts(files);return files


async def execute(run):
    socket_dir=None;server=None;process=None;name=f"tihu-{run['id']}-{run['lease'][:8]}"
    try:
        if run['snapshot']['harness']!=domain.harness():raise ValueError('execution_environment_changed')
        with db.engine.connect() as c:key=db.row(c,select(db.credentials).where(db.credentials.c.id==run['key_id'],db.credentials.c.owner_id==run['owner_id']))
        if not key or not still_active(run):raise ValueError('credential_revoked')
        broker=Broker(run,unseal(key['sealed'],run['owner_id'],key['id']))
        Path(settings.broker_root).mkdir(parents=True,mode=0o700,exist_ok=True)
        socket_dir=tempfile.mkdtemp(prefix=run['id']+'-',dir=settings.broker_root);os.chmod(socket_dir,0o711)
        application=web.Application(client_max_size=192*1024);application.router.add_route('*','/{tail:.*}',broker.handle)
        server=web.AppRunner(application,access_log=None,shutdown_timeout=2);await server.setup();sock=socket_dir+'/bridge.sock';await web.UnixSite(server,sock).start();os.chown(sock,65532,65532);os.chmod(sock,0o600)
        iid=await image_id();spec={**run['snapshot'],'broker_token':broker.token};spec['base_url']='http://127.0.0.1:9090/v1'
        process=await asyncio.create_subprocess_exec(*docker_command(run,socket_dir,iid),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
        stdout,_=await asyncio.wait_for(process.communicate(json.dumps(spec).encode()),settings.run_seconds+10)
        if process.returncode!=0:raise ValueError('sandbox_failed')
        if len(stdout)>3*1024*1024:raise ValueError('sandbox_output_too_large')
        packet=json.loads(stdout)
        if not isinstance(packet,dict) or packet.get('ok') is not True or not isinstance(packet.get('files'),dict):raise ValueError('invalid_sandbox_result')
        files=packet['files'];size=validate_artifacts(files)
        with db.engine.begin() as c:
            current=db.row(c,select(db.runs).where(db.runs.c.id==run['id']))
            if not current or current['status']!='running' or current['lease']!=run['lease']:return
            c.execute(db.artifacts.insert().values(run_id=run['id'],files=files,sha256=stable_hash(files),size=size))
            c.execute(update(db.runs).where(db.runs.c.id==run['id']).values(status='succeeded',finished=db.now(),heartbeat=db.now(),metrics={'calls':broker.calls,'image_id':iid,'elapsed_ms':int((db.now()-run['started'])*1000)}))
            db.log(c,run['id'],'succeeded','Artifact saved privately. Preview it before choosing to publish.')
    except asyncio.TimeoutError:
        with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='running').values(status='failed',finished=db.now(),error='sandbox_timeout'));db.log(c,run['id'],'failed','Sandbox time limit reached. No automatic paid retry.')
        if process:process.kill();await process.wait()
    except Exception as exc:
        allowed={'execution_environment_changed','credential_revoked','sandbox_failed','sandbox_output_too_large','invalid_sandbox_result','container_command_failed','container_command_timeout','untrusted_sandbox_image'}
        code=str(exc) if str(exc) in allowed else 'runner_failure'
        with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='running').values(status='failed',finished=db.now(),error=code));db.log(c,run['id'],'failed','Experiment stopped safely. Paid requests are never retried automatically.')
    finally:
        if server:await server.cleanup()
        if socket_dir:shutil.rmtree(socket_dir,ignore_errors=True)
        await remove_container(name)


async def worker_loop():
    await sweep_orphans();reap_stale();tasks=set()
    while True:
        reap_stale()
        while len(tasks)<settings.concurrency:
            run=claim()
            if not run:break
            task=asyncio.create_task(execute(run));tasks.add(task);task.add_done_callback(tasks.discard)
        await asyncio.sleep(0.5)

if __name__=='__main__':
    db.check_schema();asyncio.run(worker_loop())
