import base64
import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import select, update
from tihu import db,domain,runner
from conftest import account,connection,submit

def test_single_claim_and_no_automatic_paid_retry(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id']
    with ThreadPoolExecutor(max_workers=6) as pool:claims=list(pool.map(lambda _:runner.claim(),range(6)))
    claimed=[x for x in claims if x];assert len(claimed)==1 and claimed[0]['id']==ident;run=claimed[0]
    with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==ident).values(heartbeat=db.now()-90))
    runner.reap_stale();assert runner.claim() is None;assert not runner.heartbeat(run);assert client.get('/api/runs/'+ident).json()['error']=='worker_lease_expired_no_automatic_retry'
@pytest.mark.parametrize('protocol',['openai','responses','anthropic'])
def test_model_proxy_hardens_request(protocol):
    snapshot={'model':'fixture','protocol':protocol,'harness':domain.harness(),'thinking':'high'};raw={'model':'fixture','messages':[{'role':'user','content':'hello'}],'input':'hello','max_tokens':999999,'max_completion_tokens':999999,'max_output_tokens':999999,'n':99,'tools':[{'type':'function','function':{'name':'write'}}],'mcp_servers':['not allowed'],'previous_response_id':'not allowed','background':True,'audio':{},'service_tier':'priority','best_of':99,'thinking':{'type':'enabled','budget_tokens':999999}}
    result=runner.constrain_payload(raw,snapshot)
    for field in ('mcp_servers','background','audio','previous_response_id','service_tier','best_of'):assert field not in result
    key={'openai':'max_completion_tokens','responses':'max_output_tokens','anthropic':'max_tokens'}[protocol];assert result[key]==snapshot['harness']['output_tokens_per_call']
    if protocol=='openai':assert result['n']==1 and 'max_tokens' not in result
    if protocol=='anthropic':assert result['thinking']['budget_tokens']<result['max_tokens']
@pytest.mark.parametrize('payload',[{'model':'expensive-model'},{'model':'fixture','tools':[{'type':'web_search'}]},{'model':'fixture','tools':[{'type':'function','function':{'name':'remote_mcp'}}]},{'model':'fixture','messages':[{'content':[{'type':'image_url','image_url':{'url':'https://secret.invalid'}}]}]}])
def test_proxy_rejects_model_switch_server_tools_and_remote_input(payload):
    with pytest.raises(ValueError):runner.constrain_payload(payload,{'model':'fixture','protocol':'openai','harness':domain.harness()})
def test_docker_is_networkless_readonly_capped_and_has_no_real_key(client):
    account(client);key=connection(client);submit(client,key);run=runner.claim();args=runner.docker_command(run,'/tmp/only-this-run','sha256:'+'a'*64);joined=' '.join(args);assert '--read-only' in args
    for flag,value in [('--network','none'),('--cap-drop','ALL'),('--security-opt','no-new-privileges=true'),('--pids-limit','96'),('--memory','512m'),('--cpus','1')]:assert args[args.index(flag)+1]==value
    assert 'test-fixture-key' not in joined and 'docker.sock' not in joined;assert 'source=/tmp/only-this-run' in joined and 'readonly' in joined
@pytest.mark.parametrize('files',[{}, {'../index.html':'eA=='},{'index.html':'bad base64!'},{'index.html':'eA==','payload.exe':'eA=='},{'index.html':base64.b64encode(b'x'*(512*1024+1)).decode()}])
def test_artifact_validation(files):
    with pytest.raises(ValueError):runner.validate_artifacts(files)
def test_artifact_bundle_valid():
    files={'index.html':base64.b64encode(b'<h1>Fixture</h1>').decode(),'assets/main.css':base64.b64encode(b'body {}').decode()};assert runner.validate_artifacts(files)==23


@pytest.mark.parametrize('protocol,raw,field,expected',[
    ('openai',{'max_tokens':120},'max_tokens',120),
    ('openai',{'max_completion_tokens':80},'max_completion_tokens',80),
    ('openai',{'max_tokens':70,'max_completion_tokens':900000},'max_completion_tokens',70),
    ('responses',{'max_output_tokens':200},'max_output_tokens',200),
    ('anthropic',{'max_tokens':128,'thinking':{'type':'enabled','budget_tokens':500}},'max_tokens',128),
])
def test_caller_token_cap_and_protocol_field_are_preserved(protocol,raw,field,expected):
    result=runner.constrain_payload(raw,{'model':'fixture','protocol':protocol,'harness':domain.harness(),'thinking':'high'})
    assert result[field]==expected
    if protocol=='openai':assert ('max_tokens' in result)!=('max_completion_tokens' in result)
    if protocol=='anthropic':assert result['thinking']['budget_tokens']<expected




@pytest.mark.parametrize('protocol,tool',[
    ('anthropic',{'name':'write','description':'Write a local file','input_schema':{'type':'object','properties':{}}}),
    ('responses',{'type':'function','name':'write','parameters':{'type':'object','properties':{}}}),
])
def test_native_local_function_tools_remain_available(protocol,tool):
    result=runner.constrain_payload({'tools':[tool]},{'model':'fixture','protocol':protocol,'harness':domain.harness()})
    assert result['tools']==[tool]
    denied={**tool,'name':'remote_mcp'}
    with pytest.raises(ValueError,match='remote_tool_denied'):
        runner.constrain_payload({'tools':[denied]},{'model':'fixture','protocol':protocol,'harness':domain.harness()})
@pytest.mark.parametrize('value',[0,-1,True,'100',None])
def test_invalid_caps_cannot_expand_or_bypass_budget(value):
    with pytest.raises(ValueError,match='invalid_output_token_limit'):
        runner.constrain_payload({'max_tokens':value},{'model':'fixture','protocol':'openai','harness':domain.harness()})


@pytest.mark.parametrize('packets,expected',[
    ([{'usage':{'prompt_tokens':20,'completion_tokens':7,'prompt_tokens_details':{'cached_tokens':4},'completion_tokens_details':{'reasoning_tokens':2}}},'[DONE]'],
     {'input':20,'output':7,'reasoning':2,'cache_read':4,'cache_write':None}),
    ([{'type':'response.completed','response':{'usage':{'input_tokens':20,'output_tokens':7,'input_tokens_details':{'cached_tokens':4},'output_tokens_details':{'reasoning_tokens':2}}}}],
     {'input':20,'output':7,'reasoning':2,'cache_read':4,'cache_write':None}),
    ([{'type':'message_start','message':{'usage':{'input_tokens':10,'output_tokens':0,'cache_read_input_tokens':4,'cache_creation_input_tokens':6}}},
      {'type':'message_delta','usage':{'output_tokens':3}}, {'type':'message_delta','usage':{'output_tokens':7}}, {'type':'message_stop'}],
     {'input':20,'output':7,'reasoning':None,'cache_read':4,'cache_write':6}),
])
def test_fragmented_sse_usage_is_cumulative_not_double_counted(packets,expected):
    usage=runner.CallUsage()
    wire=''.join('data: '+(packet if isinstance(packet,str) else json.dumps(packet))+'\r\n\r\n' for packet in packets).encode()
    for index in range(0,len(wire),7):usage.feed(wire[index:index+7])
    usage.close()
    assert usage.tokens==expected and usage.complete


def test_unknown_and_partial_usage_never_claims_free_or_complete():
    broker=runner.Broker({'started':db.now()},'fixture')
    first=runner.CallUsage();first.observe({'usage':{'prompt_tokens':10,'completion_tokens':0}});first.finished=True
    partial=runner.CallUsage();partial.observe({'type':'message_start','message':{'usage':{'input_tokens':4}}})
    broker.calls=3;broker.usage=[first,partial,runner.CallUsage()]
    metrics=broker.metrics()
    assert metrics['tokens']=={'input':14,'output':0,'reasoning':None,'cache_read':None,'cache_write':None}
    assert metrics['usage_calls']==2 and not metrics['usage_complete'] and metrics['cost'] is None


def provider_fixture(monkeypatch,chunks,*,status=200,content_type='text/event-stream'):
    async def stream(size):
        for chunk in chunks:yield chunk
    response=SimpleNamespace(status=status,content_length=None,headers={'content-type':content_type},content=SimpleNamespace(iter_chunked=stream))
    @asynccontextmanager
    async def post(*args,**kwargs):yield response
    @asynccontextmanager
    async def session():yield SimpleNamespace(post=post)
    monkeypatch.setattr(runner,'outbound_session',session)


def broker_request(broker):
    async def payload():return {'model':broker.run['snapshot']['model'],'messages':[],'stream':True}
    return SimpleNamespace(method='POST',headers={'authorization':'Bearer '+broker.token},json=payload)


def test_response_limit_retains_partial_usage_without_leaking_provider_body(client,monkeypatch):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];run=runner.claim();broker=runner.Broker(run,'fixture-secret')
    usage=b'data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n'
    provider_fixture(monkeypatch,[usage,b'fixture-secret-model-body'*100]);monkeypatch.setattr(runner,'RESPONSE_LIMIT',len(usage)+10)
    response=asyncio.run(broker.handle(broker_request(broker)))
    assert json.loads(response.body)=={'error':'provider_response_too_large'}
    assert broker.calls==1
    with db.engine.connect() as c:stored=db.row(c,select(db.runs).where(db.runs.c.id==ident));events=db.rows(c,select(db.events).where(db.events.c.run_id==ident))
    assert stored['metrics']['tokens']['input']==12 and stored['metrics']['usage_calls']==1 and not stored['metrics']['usage_complete']
    assert {event['kind'] for event in events}>={'call_started','call_finished'}
    assert 'fixture-secret' not in json.dumps(events)


def test_provider_error_is_stable_and_usage_survives_failure(client,monkeypatch):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];run=runner.claim();broker=runner.Broker(run,'fixture-secret')
    provider_fixture(monkeypatch,[json.dumps({'error':{'message':'fixture-secret-model-body'},'usage':{'prompt_tokens':9,'completion_tokens':2}}).encode()],status=429,content_type='application/json')
    response=asyncio.run(broker.handle(broker_request(broker)))
    runner.fail_run(run,broker.error)
    result=client.get('/api/runs/'+ident).json()
    assert json.loads(response.body)=={'error':'provider_rate_limited'}
    assert result['status']=='failed' and result['error']=='provider_rate_limited'
    assert result['metrics']['tokens']['input']==9 and result['metrics']['tokens']['output']==2 and result['metrics']['cost'] is None


@pytest.mark.parametrize('stop',['canceled','lease_lost'])
def test_inactive_run_removes_daemon_container_before_broker_cleanup(client,monkeypatch,stop):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];run=runner.claim();actions=[]
    class Server:
        def __init__(self,*args,**kwargs):pass
        async def setup(self):pass
        async def cleanup(self):actions.append('broker_cleanup')
    class Site:
        def __init__(self,*args,**kwargs):pass
        async def start(self):pass
    class Input:
        def write(self,data):pass
        async def drain(self):pass
        def close(self):pass
    class Process:
        returncode=None
        def __init__(self):
            self.stdin=Input();self.stdout=asyncio.StreamReader();self.stderr=asyncio.StreamReader();self.stopped=asyncio.Event()
        async def wait(self):await self.stopped.wait();return self.returncode
        def kill(self):actions.append('cli_kill');self.returncode=-9;self.stopped.set()
    async def launch(*args,**kwargs):
        nonlocal process
        process=Process()
        with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==ident).values(**({'status':'canceled','error':'user_canceled'} if stop=='canceled' else {'lease':'f'*32})))
        return process
    async def command(*args,**kwargs):
        if args[:3]==('docker','rm','-f'):
            actions.append(('removed',args[3]));process.returncode=-9;process.stopped.set()
        return ''
    async def image():return 'sha256:'+'a'*64
    process=None
    monkeypatch.setattr(runner.web,'AppRunner',Server);monkeypatch.setattr(runner.web,'UnixSite',Site)
    monkeypatch.setattr(runner.os,'chown',lambda *args:None);monkeypatch.setattr(runner.os,'chmod',lambda *args:None)
    monkeypatch.setattr(runner,'image_id',image);monkeypatch.setattr(runner,'command',command);monkeypatch.setattr(runner.asyncio,'create_subprocess_exec',launch)
    asyncio.run(runner.execute(run))
    assert actions[0]==('removed',f"tihu-{ident}-{run['lease'][:8]}") and actions[1]=='broker_cleanup'
    result=client.get('/api/runs/'+ident).json()
    if stop=='canceled':assert result['status']=='canceled' and result['error']=='user_canceled'
    else:assert result['status']=='running'


def test_canceled_provider_stream_keeps_consumption(client,monkeypatch):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];run=runner.claim();broker=runner.Broker(run,'fixture')
    async def scenario():
        observed=asyncio.Event()
        async def stream(size):
            yield b'data: {"type":"message_start","message":{"usage":{"input_tokens":17,"output_tokens":0}}}\n\n'
            observed.set();await asyncio.Event().wait()
        response=SimpleNamespace(status=200,content_length=None,headers={'content-type':'text/event-stream'},content=SimpleNamespace(iter_chunked=stream))
        @asynccontextmanager
        async def post(*args,**kwargs):yield response
        @asynccontextmanager
        async def session():yield SimpleNamespace(post=post)
        monkeypatch.setattr(runner,'outbound_session',session)
        task=asyncio.create_task(broker.handle(broker_request(broker)));await observed.wait()
        with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==ident).values(status='canceled',error='user_canceled'))
        task.cancel()
        with pytest.raises(asyncio.CancelledError):await task
    asyncio.run(scenario())
    result=client.get('/api/runs/'+ident).json()
    assert result['status']=='canceled' and result['metrics']['calls']==1
    assert result['metrics']['tokens']['input']==17 and not result['metrics']['usage_complete'] and result['metrics']['cost'] is None
