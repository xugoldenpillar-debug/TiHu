"""All accounts, provider credentials and generated artifacts here are test fixtures."""
import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import insert, update
from tihu import api, db, domain, security
from tihu.config import settings
PASSWORD=' test password with spaces '
MODEL='fixture-model'
KEY='test-fixture-key-not-a-real-secret'
@pytest.fixture(autouse=True)
def isolated_database(tmp_path,monkeypatch):
    engine=db.make_engine('sqlite:///'+str(tmp_path/'test.db'));monkeypatch.setattr(db,'engine',engine)
    monkeypatch.setattr(settings,'production',False);monkeypatch.setattr(settings,'smtp_host','');monkeypatch.setattr(settings,'registration',True);monkeypatch.setattr(settings,'vote_age',0);monkeypatch.setattr(settings,'broker_root',str(tmp_path/'brokers'))
    hasher=PasswordHasher(time_cost=1,memory_cost=1024,parallelism=1)
    for module in (api,domain,security):monkeypatch.setattr(module,'password_hasher',hasher)
    monkeypatch.setattr(api,'DUMMY_HASH',hasher.hash('not an account password'));db.init();domain.seed();yield;engine.dispose()
@pytest.fixture
def client():
    with TestClient(api.app,base_url=settings.app_origin,headers={'Origin':settings.app_origin}) as result:yield result
def account(client,name='alice'):
    r=client.post('/api/auth/register',json={'username':name,'email':name+'@example.com','password':PASSWORD});assert r.status_code==201,r.text;data=r.json();client.headers['x-csrf-token']=data['csrf'];return data['user']
def connection(client):
    r=client.post('/api/keys',json={'label':'Fixture only','base_url':'https://api.openai.com/v1','protocol':'openai','api_key':KEY});assert r.status_code==201,r.text;ident=r.json()['id']
    with db.engine.begin() as c:c.execute(update(db.credentials).where(db.credentials.c.id==ident).values(models=[MODEL]))
    return ident
def version(client):
    task=client.get('/api/challenges').json()[0];return client.get('/api/challenges/'+task['id']).json()['versions'][0]['id']
def submit(client,key,vid=None,idempotency=None,**kwargs):
    return client.post('/api/runs',headers={'Idempotency-Key':idempotency or db.uid()},json={'key_id':key,'version_id':vid or version(client),'model':MODEL,'consent':True,**kwargs})
def complete(ident,published=False,html='<!doctype html><title>TEST FIXTURE</title><h1>Fixture, not a model result</h1>'):
    import base64
    files={'index.html':base64.b64encode(html.encode()).decode()}
    with db.engine.begin() as c:
        c.execute(update(db.runs).where(db.runs.c.id==ident).values(status='succeeded',published=published,finished=db.now(),metrics={'calls':2}));c.execute(insert(db.artifacts).values(run_id=ident,files=files,sha256=security.stable_hash(files),size=len(html.encode())))
    return files
