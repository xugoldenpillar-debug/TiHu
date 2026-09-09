import base64
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import update
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
