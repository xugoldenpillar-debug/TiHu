import base64
import asyncio
from io import BytesIO
import json
import sys
import pytest
from urllib.parse import quote, urljoin, urlsplit
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from tihu import db, preview, security
from tihu.config import settings
from conftest import account, complete, connection, submit
from PIL import Image
from tihu.config import Settings,validate_origin

def prod(**kwargs):
    fields=dict(production=True,role='api',database_url='postgresql+psycopg://unused',app_origin='https://app.tihu.example',preview_origin='https://preview.other.example',master_keys={'v1':base64.b64encode(b'1'*32).decode()},active_key='v1',signing_key=base64.b64encode(b'2'*32).decode(),smtp_host='mail.example',sandbox_runtime='runsc');fields.update(kwargs);return Settings(**fields)
@pytest.mark.parametrize('value',['https://u:p@example.com','https://example.com/#x','ftp://example.com','https://example.com/path'])
def test_origin_validation_rejects_non_origins(value):
    with pytest.raises(ValueError):validate_origin('origin',value)
def test_production_preview_must_be_unrelated_origin():
    with pytest.raises(ValueError):prod(preview_origin='https://preview.tihu.example').validate()
@pytest.fixture
def preview_bundle(client):
    account(client)
    ident=submit(client,connection(client)).json()['id']
    complete(ident)
    source={
        'index.html': '<!doctype html><link rel="stylesheet" href="assets/style.css"><img src="assets/logo.svg"><script type="module" src="scripts/main.js"></script>',
        'assets/style.css': 'body { background: rgb(24, 91, 54); }',
        'assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="green"/></svg>',
        'scripts/main.js': 'import {label} from "./label.mjs"; document.body.dataset.fixture=label;',
        'scripts/label.mjs': 'export const label="multi-file";',
        'pages/detail.html': '<!doctype html><link rel="stylesheet" href="../assets/style.css">Nested fixture',
    }
    files={path:base64.b64encode(text.encode()).decode() for path,text in source.items()}
    with db.engine.begin() as c:
        c.execute(update(db.artifacts).where(db.artifacts.c.run_id==ident).values(files=files,sha256=security.stable_hash(files),size=sum(len(text.encode()) for text in source.values())))
    return client.get('/api/runs/'+ident+'/preview').json()['url'], source


def policy(response):
    return {tokens[0]:tokens[1:] for clause in response.headers['content-security-policy'].split(';') if (tokens:=clause.split())}


def test_preview_redirect_preserves_capability_and_relative_assets(preview_bundle):
    link,source=preview_bundle
    assert link.endswith('/index.html')
    prefix=link.removesuffix('index.html')
    with TestClient(preview.app,base_url=settings.preview_origin) as browser:
        for bare in (prefix.rstrip('/'),prefix):
            redirect=browser.get(bare,follow_redirects=False)
            assert redirect.status_code==307
            assert urljoin(bare,redirect.headers['location'])==link
            document=browser.get(bare)
            assert str(document.url)==link
            assert document.text==source['index.html']
        for path in source:
            response=browser.get(urljoin(link,path))
            assert response.status_code==200
            assert response.text==source[path]
        module=browser.get(urljoin(urljoin(link,'scripts/main.js'),'./label.mjs'),headers={'Origin':'null'})
        assert module.text==source['scripts/label.mjs']
        assert module.headers['access-control-allow-origin']=='*'
        nested=browser.get(urljoin(urljoin(link,'pages/detail.html'),'../assets/style.css'))
        assert nested.text==source['assets/style.css']


def test_preview_opaque_origin_subresources_keep_signed_scope(preview_bundle):
    link,source=preview_bundle
    prefix=link.removesuffix('index.html')
    with TestClient(preview.app,base_url=settings.preview_origin) as browser:
        for path in source:
            response=browser.get(urljoin(link,path),headers={'Origin':'null'})
            directives=policy(response)
            assert directives['sandbox']==['allow-scripts']
            assert directives['default-src']==["'none'"]
            for name in ('script-src','style-src','img-src','font-src','media-src'):
                remote_sources=[value for value in directives[name] if value.startswith(('http:', 'https:'))]
                assert remote_sources==[prefix]
                assert "'self'" not in directives[name]
            for name in ('connect-src','worker-src','child-src','frame-src','object-src','form-action','base-uri'):
                assert directives[name]==["'none'"]
            assert directives['frame-ancestors']==[settings.app_origin]
            assert response.headers['cross-origin-resource-policy']=='cross-origin'
            assert response.headers['access-control-allow-origin']=='*'
            assert 'access-control-allow-credentials' not in response.headers
            assert response.headers['x-content-type-options']=='nosniff'
            assert 'no-store' in response.headers['cache-control']
            assert response.headers['referrer-policy']=='no-referrer'


@pytest.mark.parametrize('path',[
    '../index.html', 'assets/../style.css', '/index.html', 'assets//style.css',
    'assets\\style.css', '.hidden.js', 'assets/.private', 'assets/%2e%2e/index.html',
    'missing.css', 'https://outside.example/image.png',
])
def test_preview_rejects_traversal_and_missing_paths(preview_bundle,path):
    link,_=preview_bundle
    prefix=urlsplit(link).path.removesuffix('index.html')
    # Encode dots as well as separators so the client cannot normalize traversal
    # before the application receives and rejects the decoded path.
    encoded=quote(path,safe='').replace('.', '%2E')
    with TestClient(preview.app,base_url=settings.preview_origin) as browser:
        assert browser.get(prefix+encoded,follow_redirects=False).status_code==404


def test_preview_redirect_requires_valid_capability(preview_bundle):
    link,_=preview_bundle
    prefix=urlsplit(link).path.removesuffix('index.html').rstrip('/')
    invalid=prefix.rsplit('/',1)[0]+'/'+'0'*64
    with TestClient(preview.app,base_url=settings.preview_origin) as browser:
        assert browser.get(invalid,follow_redirects=False).status_code==404
        assert browser.get(invalid+'/',follow_redirects=False).status_code==404


def jpeg_fixture(size=(960,600),format='JPEG'):
    with BytesIO() as buffer:
        Image.new('RGB',size,(24,91,54)).save(buffer,format=format)
        return buffer.getvalue()


def thumbnail_packet(data):
    return json.dumps({'ok':True,'data':base64.b64encode(data).decode()}).encode()


def test_thumbnail_decoder_accepts_only_bounded_real_jpeg():
    from tihu import thumbnails
    valid=jpeg_fixture()
    decoded=thumbnails.jpeg_bytes(thumbnail_packet(valid))
    with Image.open(BytesIO(decoded)) as image:
        image.load()
        assert image.format=='JPEG'
        assert image.size==(960,600)
    for invalid in (
        jpeg_fixture((959,600)),
        jpeg_fixture(format='PNG'),
        valid[:100]+b'\xff\xd9',
        b'\xff\xd8'+b'\x00'*thumbnails.MAX_JPEG+b'\xff\xd9',
    ):
        with pytest.raises((ValueError,OSError)):
            thumbnails.jpeg_bytes(thumbnail_packet(invalid))


def test_thumbnail_failure_preserves_success_without_leaking_guest_text(client,monkeypatch,caplog):
    from tihu import thumbnails
    account(client)
    ident=submit(client,connection(client)).json()['id']
    files=complete(ident)
    private_text='fixture-private-artifact-or-provider-content'

    async def unavailable(*args,**kwargs):
        raise RuntimeError(private_text)

    monkeypatch.setattr(thumbnails,'_output',unavailable)
    assert asyncio.run(thumbnails.capture(ident,files)) is False
    with db.engine.connect() as c:
        run=db.row(c,select(db.runs).where(db.runs.c.id==ident))
        assert run['status']=='succeeded'
        assert db.row(c,select(db.artifacts).where(db.artifacts.c.run_id==ident))['files']==files
        assert c.execute(select(db.thumbnails.c.run_id).where(db.thumbnails.c.run_id==ident)).first() is None
        events=db.rows(c,select(db.events).where(db.events.c.run_id==ident))
    assert any(event['kind']=='thumbnail' for event in events)
    assert private_text not in json.dumps(events)
    assert private_text not in caplog.text
    assert client.get('/api/runs/'+ident+'/thumbnail').status_code==404


def test_thumbnail_oversized_output_cannot_stall_pipe_cleanup():
    from tihu import thumbnails

    async def oversized_guest():
        with pytest.raises(ValueError,match='invalid_thumbnail_output'):
            await asyncio.wait_for(thumbnails._output([
                sys.executable,'-c','import sys; sys.stdout.buffer.write(b"x" * 1048576); sys.stdout.flush()',
            ],limit=1024),timeout=4)

    asyncio.run(oversized_guest())
