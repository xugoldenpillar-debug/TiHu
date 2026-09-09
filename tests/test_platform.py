import json
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from sqlalchemy import delete,func,select,update
from tihu import api,db,domain,preview,security
from tihu.config import settings
from conftest import account,complete,connection,submit,version,PASSWORD,MODEL,KEY

def test_empty_results_are_not_fabricated(client):
    assert len(client.get('/api/challenges').json())==3
    assert client.get('/api/stats').json()=={'challenges':3,'works':0,'models':0}
    assert client.get('/api/leaderboard?days=0').status_code==200
    assert client.get('/api/leaderboard?days=7').json()['items']==[]
    assert client.get('/api/leaderboard?days=3').status_code==422

def test_auth_cookie_csrf_origin_and_whitespace_password(client):
    user=account(client);cookie=client.cookies.get(settings.cookie);assert cookie and PASSWORD not in cookie
    with db.engine.connect() as c:
        stored=db.row(c,select(db.users).where(db.users.c.id==user['id']));assert stored['password'].startswith('$argon2id$');assert c.execute(select(db.sessions.c.digest)).scalar_one()==security.digest(cookie)
    assert client.post('/api/auth/logout',headers={'Origin':'https://attacker.invalid'}).status_code==403
    assert client.post('/api/auth/logout',headers={'x-csrf-token':'invalid'}).status_code==403
    assert client.post('/api/auth/logout').status_code==200
    assert client.get('/api/me').json()['user'] is None
    client.headers.pop('x-csrf-token',None);assert client.post('/api/auth/login',json={'email':user['email'],'password':PASSWORD.strip()}).status_code==401
    response=client.post('/api/auth/login',json={'email':user['email'],'password':PASSWORD});assert response.status_code==200;assert 'HttpOnly' in response.headers['set-cookie'];assert 'SameSite=lax' in response.headers['set-cookie']

def test_revoked_cookie_does_not_prevent_logging_in(client):
    user=account(client)
    with db.engine.begin() as c:c.execute(delete(db.sessions))
    client.headers.pop('x-csrf-token');assert client.post('/api/auth/login',json={'email':user['email'],'password':PASSWORD}).status_code==200

def test_validation_never_echoes_credentials(client):
    account(client);response=client.post('/api/keys',json={'label':'bad','base_url':'https://api.openai.com/v1','api_key':'secret'});assert response.status_code==422;assert 'secret' not in response.text;assert 'input' not in response.json()['errors'][0]

def test_credentials_are_encrypted_owner_bound_and_not_returned(client):
    owner=account(client);ident=connection(client);listing=client.get('/api/keys').json();assert listing[0]['last4']==KEY[-4:] and KEY not in json.dumps(listing)
    with db.engine.connect() as c:row=db.row(c,select(db.credentials).where(db.credentials.c.id==ident))
    assert row['sealed']!=KEY;assert security.unseal(row['sealed'],owner['id'],ident)==KEY
    client.post('/api/auth/logout');account(client,'bob');assert client.get('/api/keys').json()==[];assert client.delete('/api/keys/'+ident).status_code==404;assert client.post('/api/keys/'+ident+'/models').status_code==404

def test_model_discovery_endpoint_does_not_expose_key(client,monkeypatch):
    account(client);ident=connection(client)
    async def fake(base,protocol,key):assert key==KEY and protocol=='openai';return ['another-fixture',MODEL]
    monkeypatch.setattr(api,'discover',fake);response=client.post('/api/keys/'+ident+'/models');assert response.json()=={'models':['another-fixture',MODEL]};assert KEY not in response.text;assert client.get('/api/keys').json()[0]['models']==response.json()['models']

def test_snapshot_idempotency_skill_deletion_and_cancel_on_key_revoke(client):
    account(client);key=connection(client);uploaded=client.post('/api/skills',content=b'---\nname: fixture\ndescription: testing\n---\nWrite a self-contained HTML page.',headers={'Content-Type':'application/octet-stream','x-file-name':'SKILL.md','x-skill-name':'Fixture'});assert uploaded.status_code==201;skill=uploaded.json()['id'];idem=db.uid();vid=version(client)
    first=submit(client,key,vid,idem,skill_ids=[skill]).json();again=submit(client,key,vid,idem,skill_ids=[skill]).json();assert first['id']==again['id'] and again['reused'];assert submit(client,key,vid,idem,prompt='different').status_code==409;assert client.delete('/api/skills/'+skill).status_code==200
    run=client.get('/api/runs/'+first['id']).json();assert run['track']=='open';assert 'SKILL.md' in run['snapshot']['skills'][0]['files'];assert KEY not in json.dumps(run);assert client.delete('/api/keys/'+key).status_code==200;assert client.get('/api/runs/'+first['id']).json()['status']=='canceled'

def test_parallel_idempotency_only_creates_one_paid_job(client):
    owner=account(client);key=connection(client);vid=version(client);idem=db.uid();body={'key_id':key,'version_id':vid,'model':MODEL,'skill_ids':[],'prompt':'','thinking':'off'}
    with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(lambda _:domain.enqueue(owner['id'],body,idem),range(12)))
    assert len({x['id'] for x in results})==1
    with db.engine.connect() as c:assert c.execute(select(func.count()).select_from(db.runs)).scalar_one()==1

def test_parallel_admission_enforces_active_quota(client):
    owner=account(client);key=connection(client);vid=version(client);body={'key_id':key,'version_id':vid,'model':MODEL}
    def attempt(_):
        from fastapi import HTTPException
        try:return domain.enqueue(owner['id'],body,db.uid())['id']
        except HTTPException as error:assert error.status_code==429;return None
    with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(attempt,range(12)))
    assert len([x for x in results if x])==settings.user_active

def test_run_privacy_publication_votes_and_model_aggregation(client):
    account(client);key=connection(client);ids=[submit(client,key).json()['id'] for _ in range(2)]
    for ident in ids:complete(ident)
    with TestClient(api.app,base_url=settings.app_origin,headers={'Origin':settings.app_origin}) as bob:
        assert bob.get('/api/runs/'+ids[0]).status_code==404;assert bob.get('/api/runs/'+ids[0]+'/source').status_code==404;assert bob.get('/api/runs/'+ids[0]+'/preview').status_code==404;assert bob.get('/api/runs').json()==[];account(bob,'bob')
        for ident in ids:
            assert client.put('/api/runs/'+ident+'/publish',json={'published':True}).status_code==200
            for _ in range(3):assert bob.put('/api/runs/'+ident+'/vote',json={'kind':'capability','active':True}).json()['count']==1
        assert bob.put('/api/runs/'+ids[0]+'/vote',json={'kind':'funny','active':True}).json()['count']==1;assert client.put('/api/runs/'+ids[0]+'/vote',json={'kind':'funny','active':True}).status_code==403
        board=bob.get('/api/leaderboard?group=models&days=0').json()['items'];assert board[0]['score']==1 and board[0]['entries']==1;assert bob.get('/api/leaderboard?group=works&limit=1').json()['items'][0]['capability']==1
        assert bob.put('/api/runs/'+ids[0]+'/vote',json={'kind':'capability','active':False}).json()['count']==0;assert KEY not in bob.get('/api/runs/'+ids[0]).text;assert bob.get('/api/runs/'+ids[0]+'/events').status_code==404

def test_preview_capabilities_csp_expiry_and_withdrawal(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];complete(ident);link=client.get('/api/runs/'+ident+'/preview').json()['url']
    with TestClient(preview.app,base_url=settings.preview_origin) as browser:
        result=browser.get(link);assert result.status_code==200;csp=result.headers['content-security-policy'];assert 'sandbox allow-scripts' in csp and 'allow-same-origin' not in csp;assert "connect-src 'none'" in csp and "worker-src 'none'" in csp and 'no-store' in result.headers['cache-control']
        parts=link.split('/');parts[-2]='0'*64;assert browser.get('/'.join(parts)).status_code==404
        client.put('/api/runs/'+ident+'/publish',json={'published':True});public_link=client.get('/api/runs/'+ident+'/preview').json()['url'];assert browser.get(public_link).status_code==200;client.put('/api/runs/'+ident+'/publish',json={'published':False});assert browser.get(public_link).status_code==404

def test_new_versions_and_runtime_changes_are_not_mixed(client):
    account(client);key=connection(client);challenge=client.post('/api/challenges',json={'title':'Fixture challenge','description':'A test-only challenge description.','prompt':'Create a self-contained HTML test fixture.','rubric':'Should contain valid HTML.'}).json();ident=submit(client,key,challenge['version_id']).json()['id'];complete(ident,True);assert client.get('/api/leaderboard?days=0').json()['items']
    new=client.post('/api/challenges/'+challenge['id']+'/versions',json={'prompt':'Create a DIFFERENT self-contained HTML fixture.','rubric':'Must contain a visible title.'});assert new.status_code==201;assert client.get('/api/leaderboard?days=0').json()['items']==[];assert client.get('/api/leaderboard?version='+challenge['version_id']).json()['items']
    with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==ident).values(environment='0'*64))
    assert client.get('/api/leaderboard?version='+challenge['version_id']).json()['items']==[];assert client.get('/api/runs/'+ident).status_code==200

def test_verified_account_and_vote_age_required(client,monkeypatch):
    who=account(client)
    with db.engine.begin() as c:c.execute(update(db.users).where(db.users.c.id==who['id']).values(verified=False))
    assert client.post('/api/keys',json={'label':'x','base_url':'https://api.openai.com/v1','api_key':KEY}).status_code==403
    with db.engine.begin() as c:c.execute(update(db.users).where(db.users.c.id==who['id']).values(verified=True))
    key=connection(client);ident=submit(client,key).json()['id'];complete(ident,True);client.post('/api/auth/logout');account(client,'bob');monkeypatch.setattr(settings,'vote_age',600);assert client.put('/api/runs/'+ident+'/vote',json={'kind':'capability','active':True}).status_code==403

def test_reset_is_single_use_and_revokes_sessions(client):
    who=account(client)
    with db.engine.begin() as c:token=api.mail_token(c,who['id'],'reset')
    response=client.post('/api/auth/reset',json={'token':token,'password':'different secure password'});assert response.status_code==200;assert client.get('/api/me').json()['user'] is None;assert client.post('/api/auth/reset',json={'token':token,'password':'different secure password'}).status_code==400

def test_moderation_revokes_votes_results_and_sessions(client):
    admin=account(client,'admin')
    with db.engine.begin() as c:c.execute(update(db.users).where(db.users.c.id==admin['id']).values(role='admin'))
    with TestClient(api.app,base_url=settings.app_origin,headers={'Origin':settings.app_origin}) as u:
        who=account(u,'author');key=connection(u);ident=submit(u,key).json()['id'];complete(ident,True);assert u.get('/api/admin/reports').status_code==403;assert client.post('/api/admin/moderate',json={'action':'suspend_user','target':who['id']}).status_code==200;assert u.get('/api/me').json()['user'] is None;assert u.get('/api/runs/'+ident).status_code==404;assert client.get('/api/leaderboard').json()['items']==[]

def test_comment_and_report_ownership(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];complete(ident,True);body='<script>window.xss = true</script>';comment=client.post('/api/runs/'+ident+'/comments',json={'body':body}).json();assert client.get('/api/runs/'+ident+'/comments').json()[0]['body']==body;client.post('/api/auth/logout');account(client,'bob');assert client.delete('/api/comments/'+comment['id']).status_code==403
    for _ in range(2):assert client.post('/api/runs/'+ident+'/report',json={'reason':'Fixture moderation report.'}).status_code==201
    with db.engine.connect() as c:assert c.execute(select(func.count()).select_from(db.reports)).scalar_one()==1

def test_sse_drains_all_terminal_events(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];complete(ident)
    with db.engine.begin() as c:
        for index in range(120):db.log(c,ident,'test','Fixture '+str(index))
    result=client.get('/api/runs/'+ident+'/events');assert result.status_code==200 and 'Fixture 119' in result.text;assert 'text/event-stream' in result.headers['content-type']
