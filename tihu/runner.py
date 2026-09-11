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
from urllib.parse import urlparse
from sqlalchemy import select, update

from . import db, domain
from .config import settings
from .security import auth_headers, outbound_session, safe_path, unseal, stable_hash, inspect_artifact_safety, sign

logger=logging.getLogger('tihu.runner')
TERMINAL=('succeeded','failed','canceled')
LEASE_SECONDS=60
RESPONSE_LIMIT=int(os.getenv('PROVIDER_RESPONSE_LIMIT',str(64*1024*1024)))
TOKEN_FIELDS=('input','output','reasoning','cache_read','cache_write')
ERROR_CODES={
    'json_object_required','model_switch_denied','tool_denied','hosted_tool_denied','remote_tool_denied',
    'input_too_deep','only_text_inputs_allowed','remote_input_denied','invalid_output_token_limit','invalid_thinking_budget',
    'execution_environment_changed','credential_revoked','sandbox_failed','sandbox_output_too_large',
    'invalid_sandbox_result','container_command_failed','container_command_timeout','untrusted_sandbox_image',
    'index_html_required','unsafe_artifact','unsafe_artifact_path','artifact_type_denied','invalid_artifact_encoding',
    'artifact_file_too_large','artifact_bundle_too_large','artifact_file_limit','artifact_read_failed',
    'sandbox_setup_failed','pi_failed','pi_start_failed','agent_output_too_large','sandbox_timeout','run_inactive',
    'provider_request_failed','provider_response_too_large','provider_auth_failed','provider_rate_limited',
    'provider_unavailable','provider_request_rejected','provider_stream_failed','model_call_limit','runner_failure',
    'worker_lease_expired_no_automatic_retry',
}


def safe_error(exc,fallback='runner_failure'):
    code=str(exc)
    return code if code in ERROR_CODES else fallback


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
            changed=c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='running',db.runs.c.lease==run['lease'],db.runs.c.heartbeat<cutoff).values(status='failed',finished=db.now(),error='worker_lease_expired_no_automatic_retry')).rowcount
            if changed:db.log(c,run['id'],'failed','Worker lease expired. This paid job will not be retried automatically.')
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
        if protocol=='anthropic' and tool.get('type') in (None,'custom') and isinstance(tool.get('input_schema'),dict):function=tool
        elif tool.get('type')=='function':function=tool.get('function',tool)
        else:raise ValueError('hosted_tool_denied')
        if not isinstance(function,dict):raise ValueError('tool_denied')
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
    fields={'openai':('max_tokens','max_completion_tokens'),'responses':('max_output_tokens',),'anthropic':('max_tokens',)}[protocol]
    supplied=[raw[field] for field in fields if field in raw]
    if any(type(value) is not int or value<1 for value in supplied):raise ValueError('invalid_output_token_limit')
    cap=min([limit,*supplied])
    if protocol=='openai':
        # Preserve the caller's protocol field; legacy compatible endpoints need max_tokens.
        field='max_completion_tokens' if 'max_completion_tokens' in raw or 'max_tokens' not in raw else 'max_tokens'
        for other in fields:payload.pop(other,None)
        payload[field]=cap;payload['n']=1
        if payload.get('stream'):payload['stream_options']={'include_usage':True}
    elif protocol=='responses':payload['max_output_tokens']=cap
    else:
        payload['max_tokens']=cap
        if isinstance(payload.get('thinking'),dict) and payload['thinking'].get('type')=='enabled':
            budget=payload['thinking'].get('budget_tokens',cap//2)
            if type(budget) is not int or budget<1 or cap<2:raise ValueError('invalid_thinking_budget')
            payload['thinking']={**payload['thinking'],'budget_tokens':min(budget,cap-1)}
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


class CallUsage:
    """One request's cumulative usage; streaming snapshots are not additive."""
    def __init__(self):
        self.tokens={field:None for field in TOKEN_FIELDS}
        self.finished=False
        self.failed=False
        self.pending=b''
        self.data=[]
        self.revision=0

    def observe(self,packet):
        if not isinstance(packet,dict):return
        kind=packet.get('type')
        if kind in ('error','response.failed','response.incomplete') or packet.get('error'):self.failed=True
        if kind in ('message_stop','response.completed','response.failed','response.incomplete'):self.finished=True
        source=packet.get('response') if isinstance(packet.get('response'),dict) else packet
        if isinstance(packet.get('message'),dict):source=packet['message']
        usage=source.get('usage')
        if not isinstance(usage,dict):return
        def number(value):return value if type(value) is int and value>=0 else None
        def details(name):return usage[name] if isinstance(usage.get(name),dict) else {}
        values={
            'input':number(usage.get('input_tokens',usage.get('prompt_tokens'))),
            'output':number(usage.get('output_tokens',usage.get('completion_tokens'))),
            'reasoning':number(details('output_tokens_details').get('reasoning_tokens',details('completion_tokens_details').get('reasoning_tokens'))),
            'cache_read':number(usage.get('cache_read_input_tokens',details('input_tokens_details').get('cached_tokens',details('prompt_tokens_details').get('cached_tokens')))),
            'cache_write':number(usage.get('cache_creation_input_tokens')),
        }
        # Anthropic's input_tokens excludes both explicitly reported cache buckets.
        if values['input'] is not None and ('cache_read_input_tokens' in usage or 'cache_creation_input_tokens' in usage):
            values['input']+=(values['cache_read'] or 0)+(values['cache_write'] or 0)
        for field,value in values.items():
            if value is not None and (self.tokens[field] is None or value>self.tokens[field]):
                self.tokens[field]=value;self.revision+=1

    def event(self):
        data=b'\n'.join(self.data);self.data.clear()
        if data.strip()==b'[DONE]':self.finished=True;return
        try:self.observe(json.loads(data))
        except (ValueError,UnicodeError,RecursionError):pass

    def feed(self,chunk):
        self.pending+=chunk
        while b'\n' in self.pending:
            line,self.pending=self.pending.split(b'\n',1);line=line.rstrip(b'\r')
            if not line:self.event()
            elif line.startswith(b'data:'):self.data.append(line[5:].lstrip(b' '))

    def close(self):
        if self.pending:self.feed(b'\n')
        if self.data:self.event()

    @property
    def complete(self):return self.finished and self.tokens['input'] is not None and self.tokens['output'] is not None

def resolve_endpoint(base: str, protocol: str) -> str:
    base = base.rstrip('/')
    if protocol == 'anthropic':
        return base + ('/messages' if base.endswith('/v1') else '/v1/messages')
    if protocol == 'responses':
        return base + ('/responses' if base.endswith('/v1') else '/v1/responses')
    if base.endswith('/chat/completions'):
        return base
    path = urlparse(base).path
    if not path or path == '/':
        return base + '/v1/chat/completions'
    return base + '/chat/completions'
class Broker:
    def __init__(self,run,key):
        self.run=run;self.key=key;self.token=secrets.token_urlsafe(32)
        self.calls=0;self.usage=[];self.image_id=None;self.error=None

    def metrics(self):
        tokens={}
        for field in TOKEN_FIELDS:
            known=[call.tokens[field] for call in self.usage if call.tokens[field] is not None]
            tokens[field]=sum(known) if known else None
        return {'calls':self.calls,'elapsed_ms':max(0,int((db.now()-self.run['started'])*1000)),
                'image_id':self.image_id,'tokens':tokens,'usage_calls':sum(any(value is not None for value in call.tokens.values()) for call in self.usage),
                'usage_complete':bool(self.calls) and len(self.usage)==self.calls and all(call.complete for call in self.usage),'cost':None}

    def persist(self,kind=None,message=None):
        with db.engine.begin() as c:
            changed=c.execute(update(db.runs).where(db.runs.c.id==self.run['id'],db.runs.c.lease==self.run['lease']).values(metrics=self.metrics())).rowcount
            if changed and kind:db.log(c,self.run['id'],kind,message)

    async def handle(self,request):
        if request.headers.get('authorization')!=f'Bearer {self.token}' and request.headers.get('x-api-key')!=self.token:return web.json_response({'error':'unauthorized'},status=401)
        if request.method!='POST':return web.json_response({'error':'method_denied'},status=405)
        try:
            raw=await request.json();payload=constrain_payload(raw,self.run['snapshot'])
        except (ValueError,TypeError,AttributeError,RecursionError,OverflowError) as exc:
            self.error=safe_error(exc,'json_object_required')
            return web.json_response({'error':self.error},status=422)
        # Recheck after reading the request, before the first outbound await.
        if not still_active(self.run):return web.json_response({'error':'run_inactive'},status=409)
        if self.calls>=self.run['snapshot']['harness']['calls']:
            self.error='model_call_limit'
            return web.json_response({'error':self.error},status=429)
        protocol=self.run['snapshot']['protocol'];base=self.run['snapshot']['base_url']
        endpoint=resolve_endpoint(base,protocol)
        self.calls+=1;call_number=self.calls;usage=CallUsage();self.usage.append(usage)
        self.persist('call_started',f'Model call {call_number} started.')
        headers=auth_headers(protocol,self.key);headers['content-type']='application/json'
        outcome='provider_request_failed';streaming=False
        try:
            async with outbound_session() as client:
                async with client.post(endpoint,headers=headers,json=payload,allow_redirects=False) as response:
                    if response.content_length and response.content_length>RESPONSE_LIMIT:raise ValueError('provider_response_too_large')
                    content_type=response.headers.get('content-type','application/json').split(';')[0].strip().lower()
                    streaming=content_type=='text/event-stream';body=bytearray()
                    async for chunk in response.content.iter_chunked(64*1024):
                        if len(body)+len(chunk)>RESPONSE_LIMIT:raise ValueError('provider_response_too_large')
                        body.extend(chunk)
                        if streaming:
                            revision=usage.revision;usage.feed(chunk)
                            if usage.revision!=revision:self.persist()
                    if streaming:usage.close()
                    else:
                        try:usage.observe(json.loads(body));usage.finished=True
                        except (ValueError,UnicodeError,RecursionError):pass
                    if response.status>=300:
                        outcome=('provider_auth_failed' if response.status in (401,403) else 'provider_rate_limited' if response.status==429 else 'provider_unavailable' if response.status>=500 else 'provider_request_rejected')
                        self.error=outcome
                        # Do not expose provider error bodies: they can echo prompts and credentials.
                        return web.json_response({'error':outcome},status=400)
                    if usage.failed or (streaming and not usage.finished):raise ValueError('provider_stream_failed')
                    outcome='completed'
                    return web.Response(body=bytes(body),status=response.status,content_type=content_type)
        except asyncio.CancelledError:
            outcome='run_inactive'
            raise
        except Exception as exc:
            logger.warning("Broker outbound request failed for run %s call %s: %s (%s)", self.run['id'], call_number, type(exc).__name__, exc)
            outcome=safe_error(exc,'provider_request_failed');self.error=outcome
            return web.json_response({'error':outcome},status=400)
        finally:
            if streaming:usage.close()
            self.persist('call_finished',f'Model call {call_number}: {outcome}.')


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
    except asyncio.CancelledError:
        if proc.returncode is None:proc.kill()
        await proc.wait();raise

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
            with db.engine.connect() as c:active=c.execute(select(db.runs.c.lease).where(db.runs.c.id==match.group(1),db.runs.c.status=='running')).scalar_one_or_none()
            if not active or not active.startswith(match.group(2)):await remove_container(name)
    except (OSError,RuntimeError):logger.warning('Orphan sweep skipped')


def output_files_from_workspace(workspace):
    files={}
    for path in Path(workspace).rglob('*'):
        if path.is_file() and not path.is_symlink():
            rel=path.relative_to(workspace).as_posix()
            if not safe_path(rel):raise ValueError('unsafe_artifact_path')
            data=path.read_bytes();files[rel]=base64.b64encode(data).decode()
    validate_artifacts(files);return files


async def sandbox_output(process,spec):
    async def send():
        process.stdin.write(json.dumps(spec).encode());await process.stdin.drain();process.stdin.close()
    async def collect(stream,limit,keep):
        data=bytearray();size=0
        while chunk:=await stream.read(64*1024):
            size+=len(chunk)
            if size>limit:raise ValueError('sandbox_output_too_large')
            if keep:data.extend(chunk)
        return bytes(data)
    tasks=[asyncio.create_task(send()),asyncio.create_task(collect(process.stdout,32*1024*1024,True)),
           asyncio.create_task(collect(process.stderr,8*1024*1024,False)),asyncio.create_task(process.wait())]
    try:
        results=await asyncio.gather(*tasks)
        return results[1]
    finally:
        for task in tasks:
            if not task.done():task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)


async def watch_run(run):
    next_heartbeat=asyncio.get_running_loop().time()+10
    while still_active(run):
        if asyncio.get_running_loop().time()>=next_heartbeat:
            if not heartbeat(run):return
            next_heartbeat=asyncio.get_running_loop().time()+10
        await asyncio.sleep(1)


def fail_run(run,code):
    with db.engine.begin() as c:
        changed=c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='running',db.runs.c.lease==run['lease']).values(status='failed',finished=db.now(),error=code)).rowcount
        if changed:db.log(c,run['id'],'failed',f'{code}. No automatic paid retry.')


async def execute(run):
    socket_dir=None;server=None;process=None;tasks=[];files=None;succeeded=False
    name=f"tihu-{run['id']}-{run['lease'][:8]}";broker=Broker(run,None)
    try:
        broker.persist('preparing','Preparing the isolated execution environment.')
        if run['snapshot']['harness']!=domain.harness():raise ValueError('execution_environment_changed')
        if not still_active(run):return
        with db.engine.connect() as c:key=db.row(c,select(db.credentials).where(db.credentials.c.id==run['key_id'],db.credentials.c.owner_id==run['owner_id']))
        if not key:raise ValueError('credential_revoked')
        broker.key=unseal(key['sealed'],run['owner_id'],key['id'])
        Path(settings.broker_root).mkdir(parents=True,mode=0o700,exist_ok=True)
        socket_dir=tempfile.mkdtemp(prefix=run['id']+'-',dir=settings.broker_root);os.chmod(socket_dir,0o711)
        application=web.Application(client_max_size=32*1024*1024);application.router.add_route('*','/{tail:.*}',broker.handle)
        server=web.AppRunner(application,access_log=None,shutdown_timeout=2);await server.setup();sock=socket_dir+'/bridge.sock';await web.UnixSite(server,sock).start();os.chown(sock,65532,65532);os.chmod(sock,0o600)
        broker.image_id=await image_id();spec={**run['snapshot'],'broker_token':broker.token};spec['base_url']='http://127.0.0.1:9090/v1'
        if not still_active(run):return
        process=await asyncio.create_subprocess_exec(*docker_command(run,socket_dir,broker.image_id),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
        broker.persist('sandbox_started','Sandbox started with external network disabled.')
        output_task=asyncio.create_task(sandbox_output(process,spec));watch_task=asyncio.create_task(watch_run(run));tasks=[output_task,watch_task]
        done,_=await asyncio.wait(tasks,timeout=settings.run_seconds+10,return_when=asyncio.FIRST_COMPLETED)
        if not done:raise asyncio.TimeoutError
        if watch_task in done:
            watch_task.result()
            broker.persist('stopping','Sandbox stopping because the run was canceled or its lease is no longer active.')
            return
        stdout=output_task.result()
        try:packet=json.loads(stdout)
        except (ValueError,UnicodeError,RecursionError):raise ValueError('sandbox_failed' if process.returncode else 'invalid_sandbox_result') from None
        if not isinstance(packet,dict):raise ValueError('invalid_sandbox_result')
        if packet.get('ok') is not True:
            code=safe_error(packet.get('error'),'sandbox_failed')
            if code=='pi_failed' and broker.error:code=broker.error
            raise ValueError(code)
        if process.returncode:raise ValueError('sandbox_failed')
        broker.persist('validating','Validating sandbox artifact files.')
        files=packet.get('files');size=validate_artifacts(files)
        safe, reason = inspect_artifact_safety(files)
        if not safe: raise ValueError('unsafe_artifact')
        with db.engine.begin() as c:
            changed=c.execute(update(db.runs).where(db.runs.c.id==run['id'],db.runs.c.status=='running',db.runs.c.lease==run['lease']).values(status='succeeded',finished=db.now(),heartbeat=db.now(),metrics=broker.metrics())).rowcount
            if not changed:return
            sha = stable_hash(files)
            c.execute(db.artifacts.insert().values(run_id=run['id'],files=files,sha256=sha,size=size))
            db.log(c,run['id'],'succeeded','Artifact saved privately. Preview it before choosing to publish.')
            expires = int(db.now() + 300)
            scope = 'private:' + run['owner_id']
            token = sign(f"{run['id']}:{sha}:{expires}:{scope}")
            preview_url = f"{settings.preview_origin}/p/{run['id']}/{sha}/{expires}/{token}/index.html"
            db.log(c,run['id'],'preview_ready',preview_url)
        succeeded=True
    except asyncio.TimeoutError:
        fail_run(run,'sandbox_timeout')
    except asyncio.CancelledError:
        fail_run(run,'worker_lease_expired_no_automatic_retry')
        raise
    except Exception as exc:
        code=safe_error(exc);logger.warning('Run %s failed: %s',run['id'],code)
        fail_run(run,code)
    finally:
        # Docker CLI termination alone leaves its daemon-owned container running.
        # Remove the guest before waiting for HTTP shutdown or deleting its socket.
        await remove_container(name)
        if process and process.returncode is None:
            try:process.kill()
            except ProcessLookupError:pass
        for task in tasks:
            if not task.done():task.cancel()
        if tasks:await asyncio.gather(*tasks,return_exceptions=True)
        if process:await process.wait()
        try:
            if server:await server.cleanup()
        except Exception:
            logger.warning('Broker cleanup failed for run %s',run['id'])
        finally:
            broker.key=None
            if socket_dir:shutil.rmtree(socket_dir,ignore_errors=True)
            broker.persist()
    if succeeded:
        try:
            from . import thumbnails
            await thumbnails.capture(run['id'],files)
        except Exception:
            with db.engine.begin() as c:db.log(c,run['id'],'thumbnail','Thumbnail capture unavailable; the saved artifact is unchanged.')


async def worker_loop():
    reap_stale();await sweep_orphans();tasks=set();last_sweep=asyncio.get_running_loop().time()
    try:
        while True:
            reap_stale()
            if asyncio.get_running_loop().time()-last_sweep>=10:
                await sweep_orphans();last_sweep=asyncio.get_running_loop().time()
            while len(tasks)<settings.concurrency:
                run=claim()
                if not run:break
                task=asyncio.create_task(execute(run));tasks.add(task);task.add_done_callback(tasks.discard)
            await asyncio.sleep(0.5)
    finally:
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)

if __name__=='__main__':
    db.check_schema();asyncio.run(worker_loop())
