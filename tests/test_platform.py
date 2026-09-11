import json
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from sqlalchemy import delete,func,insert,select,update
from tihu import api,db,domain,preview,security
from tihu.config import settings
from conftest import account,complete,connection,submit,version,PASSWORD,MODEL,KEY

def test_empty_results_are_not_fabricated(client):
    assert client.get('/api/challenges').json()['total']==4
    assert client.get('/api/stats').json()=={'challenges':4,'works':0,'models':0}
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

def test_custom_provider_and_official_leaderboard_partition(client,monkeypatch):
    owner=account(client);official_key=connection(client)
    custom_res=client.post('/api/keys',json={'label':'Custom relay','base_url':'https://api.siliconflow.cn/v1','protocol':'openai','api_key':KEY})
    assert custom_res.status_code==201
    custom_key=custom_res.json()['id']
    with db.engine.begin() as c:c.execute(update(db.credentials).where(db.credentials.c.id==custom_key).values(models=['custom-fast-model']))
    keys=client.get('/api/keys').json()
    assert any(k['id']==official_key and k['is_official'] is True for k in keys)
    assert any(k['id']==custom_key and k['is_official'] is False for k in keys)
    vid=version(client)
    run_official=submit(client,official_key,vid).json()['id'];complete(run_official,True)
    run_custom=submit(client,custom_key,vid,model='custom-fast-model').json()['id'];complete(run_custom,True)
    all_board=client.get('/api/leaderboard?provider_scope=all').json()['items']
    official_board=client.get('/api/leaderboard?provider_scope=official').json()['items']
    custom_board=client.get('/api/leaderboard?provider_scope=custom').json()['items']
    all_ids={x['id'] for x in all_board};off_ids={x['id'] for x in official_board};cust_ids={x['id'] for x in custom_board}
    assert run_official in all_ids and run_custom in all_ids
    assert run_official in off_ids and run_custom not in off_ids
    assert run_custom in cust_ids and run_official not in cust_ids

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
        assert bob.get('/api/runs/'+ids[0]).status_code==404;assert bob.get('/api/runs/'+ids[0]+'/source').status_code==404;assert bob.get('/api/runs/'+ids[0]+'/preview').status_code==404;assert bob.get('/api/runs').json()=={'items':[],'next_cursor':None,'total':0};account(bob,'bob')
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
    assert [x['id'] for x in client.get('/api/runs?challenge='+challenge['id']).json()['items']]==[ident]
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

def test_sse_drains_all_terminal_events_and_resumes_without_duplicates(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];complete(ident)
    with db.engine.begin() as c:
        for index in range(450):db.log(c,ident,'test','Fixture '+str(index))
        expected=list(c.execute(select(db.events.c.id).where(db.events.c.run_id==ident).order_by(db.events.c.id)).scalars())
    result=client.get('/api/runs/'+ident+'/events')
    received=[int(line[4:]) for line in result.text.splitlines() if line.startswith('id: ')]
    assert received==expected
    assert result.text.count('event: state')==1
    resumed=client.get('/api/runs/'+ident+'/events?after='+str(expected[100]),headers={'Last-Event-ID':str(expected[220])})
    assert [int(line[4:]) for line in resumed.text.splitlines() if line.startswith('id: ')]==expected[221:]
    assert resumed.text.count('event: state')==1
    assert client.get('/api/runs/'+ident+'/events',headers={'Last-Event-ID':'not-an-id'}).status_code==422

def test_public_summaries_and_admin_detail_never_expose_skill_files(client):
    account(client);key=connection(client)
    private_text='Private fixture instructions never intended for the public snapshot.'
    skill=client.post('/api/skills',content=private_text.encode(),headers={'x-file-name':'SKILL.md'}).json()['id']
    ident=submit(client,key,skill_ids=[skill],prompt='Disclosed custom prompt').json()['id'];complete(ident,True)
    owner_detail=client.get('/api/runs/'+ident).json()
    assert owner_detail['snapshot']['skills'][0]['files']['SKILL.md']==private_text
    assert owner_detail['can_manage'] and owner_detail['can_view_events']
    assert owner_detail['vote_reason']=='cannot_vote_own_work'
    assert 'snapshot' not in client.get('/api/runs?mine=true').json()['items'][0]
    with TestClient(api.app,base_url=settings.app_origin,headers={'Origin':settings.app_origin}) as stranger:
        for path in ('/api/runs','/api/leaderboard?track=all'):
            response=stranger.get(path);item=response.json()['items'][0]
            assert item['id']==ident and 'snapshot' not in item
            assert private_text not in response.text and not item['can_manage']
        response=stranger.get('/api/runs/'+ident);detail=response.json()
        assert private_text not in response.text and 'files' not in detail['snapshot']['skills'][0]
        assert detail['snapshot']['prompt']=='Disclosed custom prompt'
        assert detail['vote_reason']=='authentication_required' and not detail['can_view_events']
        admin=account(stranger,'admin')
        with db.engine.begin() as c:c.execute(update(db.users).where(db.users.c.id==admin['id']).values(role='admin'))
        client.put('/api/runs/'+ident+'/publish',json={'published':False})
        detail=stranger.get('/api/runs/'+ident).json()
        assert detail['can_view_events'] and not detail['can_manage']
        assert 'files' not in detail['snapshot']['skills'][0]
        assert stranger.get('/api/skills/'+skill).status_code==404

def test_cursor_pagination_keeps_equal_time_boundaries_and_searches_before_limit(client):
    account(client);key=connection(client)
    challenge_ids=[x['id'] for x in client.get('/api/challenges').json()['items']]
    with db.engine.begin() as c:c.execute(update(db.challenges).values(created=1000))
    cursor=None;seen=[]
    while True:
        page=client.get('/api/challenges',params={'limit':1,**({'cursor':cursor} if cursor else {})}).json()
        assert page['total']==4;seen.extend(x['id'] for x in page['items']);cursor=page['next_cursor']
        if not cursor:break
    assert seen==sorted(challenge_ids)
    with db.engine.begin() as c:c.execute(update(db.challenges).where(db.challenges.c.id==seen[-1]).values(title='Only searchable 100% fixture'))
    assert [x['id'] for x in client.get('/api/challenges?q=100%25&limit=1').json()['items']]==[seen[-1]]
    run_ids=[]
    for _ in range(3):
        ident=submit(client,key).json()['id'];complete(ident,True);run_ids.append(ident)
    with db.engine.begin() as c:
        c.execute(update(db.runs).values(created=2000))
        c.execute(update(db.runs).where(db.runs.c.id==min(run_ids)).values(model='Unique 100% model'))
    cursor=None;seen=[]
    while True:
        page=client.get('/api/runs',params={'limit':1,**({'cursor':cursor} if cursor else {})}).json()
        assert page['total']==3;seen.extend(x['id'] for x in page['items']);cursor=page['next_cursor']
        if not cursor:break
    assert seen==sorted(run_ids,reverse=True)
    assert [x['id'] for x in client.get('/api/runs?q=100%25&limit=1').json()['items']]==[min(run_ids)]
    assert client.get('/api/runs?cursor=invalid').status_code==422

def test_skill_versions_are_immutable_and_legacy_backfill_is_idempotent(client):
    owner=account(client);key=connection(client);ident=db.uid();original={'SKILL.md':'Original legacy fixture skill instructions.'}
    db.skill_versions.drop(db.engine);db.thumbnails.drop(db.engine)
    with db.engine.begin() as c:c.execute(insert(db.skills).values(id=ident,owner_id=owner['id'],name='Legacy',files=original,sha256=security.stable_hash(original),created=1234))
    db.init();db.init()
    assert client.get('/api/skills/'+ident).json()['versions']==[{'number':1,'sha256':security.stable_hash(original),'created':1234}]
    run_id=submit(client,key,skill_ids=[ident]).json()['id']
    updated='Updated fixture skill instructions used only by new runs.'
    assert client.put('/api/skills/'+ident,content=updated.encode(),headers={'x-file-name':'SKILL.md','x-skill-name':'Updated'}).json()['current_version']==2
    db.init()
    detail=client.get('/api/skills/'+ident).json()
    assert [x['number'] for x in detail['versions']]==[2,1]
    assert detail['files']=={'SKILL.md':updated}
    assert client.get('/api/skills/'+ident+'?version=1').json()['files']==original
    assert client.get('/api/runs/'+run_id).json()['snapshot']['skills'][0]['files']==original
    assert client.get('/api/skills/'+ident+'?version=3').status_code==404
    assert client.delete('/api/skills/'+ident).status_code==200
    assert client.get('/api/runs/'+run_id).json()['snapshot']['skills'][0]['files']==original

def test_parallel_revision_writers_allocate_unique_versions(client):
    who=account(client)
    created=client.post('/api/challenges',json={'title':'Concurrent fixture','description':'A test-only challenge description.','prompt':'Create a self-contained test fixture.','rubric':'Must be valid HTML.'}).json()
    def revise(index):
        return api.create_version(created['id'],api.VersionInput(prompt='Create fixture revision '+str(index),rubric='Must be valid HTML.'),who)
    with ThreadPoolExecutor(max_workers=4) as pool:versions=list(pool.map(revise,range(6)))
    assert sorted(x['number'] for x in versions)==list(range(2,8))
    assert [x['number'] for x in client.get('/api/challenges/'+created['id']).json()['versions']]==list(range(7,0,-1))
    skill=client.post('/api/skills',content=b'Original concurrent fixture skill.').json()['id']
    def update_skill(index):
        with db.engine.begin() as c:return api.persist_skill(c,skill,who,'Fixture',{'SKILL.md':'Concurrent fixture revision '+str(index)})
    with ThreadPoolExecutor(max_workers=4) as pool:revisions=list(pool.map(update_skill,range(6)))
    assert sorted(x['current_version'] for x in revisions)==list(range(2,8))
    assert [x['number'] for x in client.get('/api/skills/'+skill).json()['versions']]==list(range(7,0,-1))

def test_thumbnail_visibility_and_retained_comment_permissions(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];complete(ident,True)
    assert client.get('/api/runs/'+ident+'/thumbnail').status_code==404
    jpeg=b'\xff\xd8\xfffixture-jpeg\xff\xd9'
    with db.engine.begin() as c:c.execute(insert(db.thumbnails).values(run_id=ident,data=jpeg,created=db.now()))
    with TestClient(api.app,base_url=settings.app_origin,headers={'Origin':settings.app_origin}) as other:
        account(other,'commenter')
        comment=other.post('/api/runs/'+ident+'/comments',json={'body':'Retained fixture comment'}).json()['id']
        response=other.get('/api/runs/'+ident+'/thumbnail')
        assert response.content==jpeg and response.headers['content-type']=='image/jpeg'
        assert other.get('/api/runs').json()['items'][0]['thumbnail_available']
        assert client.get('/api/runs/'+ident+'/comments').json()[0]['can_delete']
        client.put('/api/runs/'+ident+'/publish',json={'published':False})
        assert other.get('/api/runs/'+ident+'/thumbnail').status_code==404
        assert other.get('/api/runs/'+ident+'/comments').status_code==404
        assert client.get('/api/runs/'+ident+'/comments').json()[0]['id']==comment
        assert client.post('/api/runs/'+ident+'/comments',json={'body':'No private additions'}).status_code==404
        assert client.delete('/api/comments/'+comment).status_code==200
        assert client.get('/api/runs/'+ident+'/comments').json()==[]

def test_quota_reports_rolling_window_and_distinct_admission_errors(client,monkeypatch):
    who=account(client);key=connection(client)
    monkeypatch.setattr(settings,'user_active',1);monkeypatch.setattr(settings,'daily_runs',2)
    first=submit(client,key).json()['id']
    assert submit(client,key).json()['detail']=='active_run_limit'
    assert client.get('/api/me').json()['quota']['active']==1
    complete(first)
    second=submit(client,key).json()['id'];complete(second)
    now=db.now()
    with db.engine.begin() as c:
        c.execute(update(db.runs).where(db.runs.c.id==first).values(created=now-100))
        c.execute(update(db.runs).where(db.runs.c.id==second).values(created=now-50))
    session=client.get('/api/me').json();quota=session['quota']
    assert quota['active']==0 and quota['daily_remaining']==0 and quota['daily_used']==2
    assert quota['next_available_at']==now-100+86400
    assert submit(client,key).json()['detail']=='daily_run_limit'
    with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==first).values(created=now-86401))
    assert client.get('/api/me').json()['quota']['daily_remaining']==1
    assert submit(client,key).status_code==201

def test_leaderboard_window_uses_work_creation_not_recent_votes(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id'];complete(ident,True)
    with db.engine.begin() as c:c.execute(update(db.runs).where(db.runs.c.id==ident).values(created=db.now()-8*86400))
    with TestClient(api.app,base_url=settings.app_origin,headers={'Origin':settings.app_origin}) as voter:
        account(voter,'voter')
        assert voter.put('/api/runs/'+ident+'/vote',json={'kind':'capability'}).status_code==200
    assert client.get('/api/leaderboard?days=7').json()['items']==[]
    assert client.get('/api/leaderboard?days=30').json()['items'][0]['capability']==1

def test_cancel_logs_once_and_does_not_cancel_completed_work(client):
    account(client);key=connection(client);ident=submit(client,key).json()['id']
    for _ in range(2):assert client.post('/api/runs/'+ident+'/cancel').status_code==200
    assert client.get('/api/runs/'+ident).json()['status']=='canceled'
    with db.engine.connect() as c:assert c.execute(select(func.count()).select_from(db.events).where(db.events.c.run_id==ident,db.events.c.kind=='canceled')).scalar_one()==1
    finished=submit(client,key).json()['id'];complete(finished)
    assert client.post('/api/runs/'+finished+'/cancel').status_code==200
    assert client.get('/api/runs/'+finished).json()['status']=='succeeded'

def test_resend_reports_delivery_failure_and_rate_limit(client,monkeypatch):
    who=account(client)
    with db.engine.begin() as c:c.execute(update(db.users).where(db.users.c.id==who['id']).values(verified=False))
    now=db.now();monkeypatch.setattr(db,'now',lambda:now)
    def fail_delivery(*args):raise OSError('Internal mail fixture detail')
    monkeypatch.setattr(api,'deliver',fail_delivery)
    response=client.post('/api/auth/resend-verification')
    assert response.status_code==503 and response.json()['detail']=='verification_delivery_failed'
    assert 'Internal mail fixture detail' not in response.text
    assert response.headers['Retry-After']=='60'
    assert client.post('/api/auth/resend-verification').status_code==429

def test_admin_management_apis_and_rbac(client):
    admin_user = account(client, 'admin_super')
    with db.engine.begin() as c:
        c.execute(update(db.users).where(db.users.c.id == admin_user['id']).values(role='admin'))
    
    with TestClient(api.app, base_url=settings.app_origin, headers={'Origin': settings.app_origin}) as normal:
        normal_user = account(normal, 'normal_coder')
        key = connection(normal)
        # 1. 普通用户不能访问 admin 接口
        assert normal.get('/api/admin/users').status_code == 403
        assert normal.get('/api/admin/challenges').status_code == 403
        assert normal.get('/api/admin/prompts').status_code == 403
        assert normal.put('/api/admin/challenges/any', json={'title': 't', 'description': 'desc', 'category': 'c'}).status_code == 403
        assert normal.delete('/api/admin/challenges/any').status_code == 403
        assert normal.put('/api/admin/prompts/any', json={'name': 'n', 'body': 'b'}).status_code == 403
        assert normal.delete('/api/admin/prompts/any').status_code == 403
        
        # 普通用户创建题目与提示词
        ch = normal.post('/api/challenges', json={'title': 'Admin Test Challenge', 'description': 'Detailed challenge description', 'category': 'Algorithm', 'prompt': 'Original Prompt Body', 'rubric': 'Original Rubric'}).json()
        ch_id = ch['id']
        pr = normal.post('/api/prompts', json={'name': 'User Prompt', 'body': 'Initial user prompt text'}).json()
        pr_id = pr['id']
        
        # 2. 管理员可查询全站用户、题目与提示词
        users = client.get('/api/admin/users?q=normal').json()
        assert any(u['id'] == normal_user['id'] for u in users)
        
        challenges = client.get('/api/admin/challenges?q=Admin+Test').json()
        assert len(challenges) >= 1 and challenges[0]['id'] == ch_id
        assert challenges[0]['prompt'] == 'Original Prompt Body'
        
        prompts = client.get('/api/admin/prompts?q=User+Prompt').json()
        assert len(prompts) >= 1 and prompts[0]['id'] == pr_id
        
        # 3. 管理员在线修改题目基础信息及 Prompt 和 Rubric
        res = client.put(f'/api/admin/challenges/{ch_id}', json={
            'title': 'Updated Admin Test Challenge',
            'description': 'Updated challenge description long enough',
            'category': 'Architecture',
            'prompt': 'Modified Prompt Text By Admin',
            'rubric': 'Modified Rubric Criteria'
        })
        assert res.status_code == 200
        detail = normal.get(f'/api/challenges/{ch_id}').json()
        assert detail['title'] == 'Updated Admin Test Challenge'
        assert detail['category'] == 'Architecture'
        assert detail['versions'][0]['prompt'] == 'Modified Prompt Text By Admin'
        
        # 4. 管理员在线修改提示词
        res_p = client.put(f'/api/admin/prompts/{pr_id}', json={'name': 'Sanitized Prompt', 'body': 'Cleaned prompt body text'})
        assert res_p.status_code == 200
        p_list = normal.get('/api/prompts').json()
        assert any(p['id'] == pr_id and p['name'] == 'Sanitized Prompt' for p in p_list)
        
        # 5. 管理员删除提示词
        assert client.delete(f'/api/admin/prompts/{pr_id}').status_code == 200
        assert not any(p['id'] == pr_id for p in normal.get('/api/prompts').json())
        
        # 6. 管理员删除题目（级联物理清理）
        # 先通过 normal 提交一个 run 并完成
        run_resp = submit(normal, key, vid=detail['versions'][0]['id'])
        assert run_resp.status_code == 201
        run_id = run_resp.json()['id']
        complete(run_id, True)
        
        # 管理员删除题目
        del_res = client.delete(f'/api/admin/challenges/{ch_id}')
        assert del_res.status_code == 200
        assert normal.get(f'/api/challenges/{ch_id}').status_code == 404
        assert normal.get(f'/api/runs/{run_id}').status_code == 404
        
        # 7. 管理员封禁自锁防护
        assert client.post('/api/admin/moderate', json={'action': 'suspend_user', 'target': admin_user['id']}).status_code == 400
