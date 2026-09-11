import io
import time
import zipfile
from fastapi.testclient import TestClient
from sqlalchemy import select
from tihu import api, db, preview, security
from tihu.config import settings
from conftest import account, version

def test_upload_artifact_success(client):
    user = account(client)
    task = client.get('/api/challenges').json()['items'][0]
    vid = version(client)
    html_content = b'<!DOCTYPE html><html><body><h1>Safe Pelican</h1><canvas id="c"></canvas></body></html>'
    response = client.post(
        '/api/runs/upload',
        data={'challenge_id': task['id'], 'version_id': vid, 'title': 'My Handcrafted Pelican'},
        files={'file': ('index.html', html_content, 'text/html')},
    )
    assert response.status_code == 201
    data = response.json()
    assert 'id' in data
    assert data['status'] == 'running'
    run_id = data['id']

    row = None
    for _ in range(50):
        with db.engine.connect() as c:
            row = db.row(c, select(db.runs).where(db.runs.c.id == run_id))
            if row and row['status'] in ('succeeded', 'failed'):
                break
        time.sleep(0.05)

    assert row and row['status'] == 'succeeded'
    with db.engine.connect() as c:
        art = db.row(c, select(db.artifacts).where(db.artifacts.c.run_id == run_id))
        events = db.rows(c, select(db.events).where(db.events.c.run_id == run_id))
    assert art is not None
    assert 'index.html' in art['files']
    kinds = [e['kind'] for e in events]
    assert 'preview_ready' in kinds
    preview_event = next(e for e in events if e['kind'] == 'preview_ready')
    assert f'/p/{run_id}/' in preview_event['message']

def test_upload_artifact_unsafe_script_blocked(client):
    user = account(client)
    task = client.get('/api/challenges').json()['items'][0]
    vid = version(client)
    malicious_html = b'<!DOCTYPE html><html><script>window.top.location = "https://evil.invalid";</script></html>'
    response = client.post(
        '/api/runs/upload',
        data={'challenge_id': task['id'], 'version_id': vid},
        files={'file': ('index.html', malicious_html, 'text/html')},
    )
    assert response.status_code == 201
    run_id = response.json()['id']

    row = None
    for _ in range(50):
        with db.engine.connect() as c:
            row = db.row(c, select(db.runs).where(db.runs.c.id == run_id))
            if row and row['status'] in ('succeeded', 'failed'):
                break
        time.sleep(0.05)

    assert row and row['status'] == 'failed'
    assert row['error'] == 'unsafe_artifact'
    with db.engine.connect() as c:
        art = db.row(c, select(db.artifacts).where(db.artifacts.c.run_id == run_id))
        events = db.rows(c, select(db.events).where(db.events.c.run_id == run_id))
    assert art is None
    kinds = [e['kind'] for e in events]
    assert 'failed' in kinds
    assert any('安全审计未通过' in e['message'] for e in events)

def test_upload_artifact_zip(client):
    user = account(client)
    task = client.get('/api/challenges').json()['items'][0]
    vid = version(client)
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w') as zf:
        zf.writestr('index.html', '<!DOCTYPE html><link rel="stylesheet" href="style.css"><h1>Zip Works</h1>')
        zf.writestr('style.css', 'body { background: #000; color: #fff; }')
    zip_bytes = bio.getvalue()

    response = client.post(
        '/api/runs/upload',
        data={'challenge_id': task['id'], 'version_id': vid},
        files={'file': ('bundle.zip', zip_bytes, 'application/zip')},
    )
    assert response.status_code == 201
    run_id = response.json()['id']

    row = None
    for _ in range(50):
        with db.engine.connect() as c:
            row = db.row(c, select(db.runs).where(db.runs.c.id == run_id))
            if row and row['status'] in ('succeeded', 'failed'):
                break
        time.sleep(0.05)

    assert row and row['status'] == 'succeeded'
    with db.engine.connect() as c:
        art = db.row(c, select(db.artifacts).where(db.artifacts.c.run_id == run_id))
    assert art is not None
    assert 'index.html' in art['files']
    assert 'style.css' in art['files']

def test_upload_missing_index_html_fails(client):
    account(client)
    task = client.get('/api/challenges').json()['items'][0]
    vid = version(client)
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w') as zf:
        zf.writestr('other.txt', 'no index html here')
    response = client.post(
        '/api/runs/upload',
        data={'challenge_id': task['id'], 'version_id': vid},
        files={'file': ('bundle.zip', bio.getvalue(), 'application/zip')},
    )
    assert response.status_code == 422

def test_preview_service_memory_cache(client):
    user = account(client)
    task = client.get('/api/challenges').json()['items'][0]
    vid = version(client)
    html_content = b'<!DOCTYPE html><html><body><h1>Fast Preview</h1></body></html>'
    response = client.post(
        '/api/runs/upload',
        data={'challenge_id': task['id'], 'version_id': vid},
        files={'file': ('index.html', html_content, 'text/html')},
    )
    run_id = response.json()['id']
    for _ in range(50):
        with db.engine.connect() as c:
            row = db.row(c, select(db.runs).where(db.runs.c.id == run_id))
            if row and row['status'] == 'succeeded':
                break
        time.sleep(0.05)

    preview_resp = client.get(f'/api/runs/{run_id}/preview')
    assert preview_resp.status_code == 200
    url = preview_resp.json()['url']
    path = url.split(settings.preview_origin)[1]

    preview_client = TestClient(preview.app, base_url=settings.preview_origin)
    # First request: populates cache
    r1 = preview_client.get(path)
    assert r1.status_code == 200
    assert b'Fast Preview' in r1.content

    # Second request: served from in-memory cache
    r2 = preview_client.get(path)
    assert r2.status_code == 200
    assert r2.content == r1.content
    assert r2.headers['content-type'] == r1.headers['content-type']
    assert 'sandbox allow-scripts' in r2.headers['content-security-policy']
