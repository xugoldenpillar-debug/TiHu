import asyncio,base64,io,socket,stat,zipfile
from unittest.mock import AsyncMock,patch
import pytest
from cryptography.exceptions import InvalidTag
from fastapi import HTTPException
from tihu import security
from tihu.config import Settings,settings
@pytest.mark.parametrize('value',['127.0.0.1','0.0.0.0','10.1.1.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','224.0.0.1','::1','::','fc00::1','fe80::1','::ffff:8.8.8.8','64:ff9b::808:808','2002:0808:0808::1'])
def test_private_and_transition_addresses_denied(value):assert not security.public_ip(value)
@pytest.mark.parametrize('value',['http://api.openai.com/v1','https://api.openai.com:bad/v1','https://api.openai.com:444/v1','https://user:pass@api.openai.com/v1','https://api.openai.com/v1?q=evil','https://api.openai.com/v1#fragment','https://api.openai.com/v1/../admin','https://api.openai.com/%76%31','https://api.openai.com//v1','https://evil.example/v1','https://api.openai.com.evil.example/v1','https://api.openai.com\\@127.0.0.1/v1'])
def test_provider_url_validation(value):
    with pytest.raises(HTTPException):security.canonical_base(value)
def test_private_ip_stays_denied_even_if_misconfigured(monkeypatch):
    monkeypatch.setattr(settings,'allowed_bases',['https://127.0.0.1/v1'])
    with pytest.raises(HTTPException):security.canonical_base('https://127.0.0.1/v1')
def test_dns_pinning_rejects_mixed_public_private_answers():
    async def check():
        loop=asyncio.get_running_loop();answers=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443)),(socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',443))]
        with patch.object(loop,'getaddrinfo',AsyncMock(return_value=answers)):
            with pytest.raises(OSError):await security.PublicResolver().resolve('allowed.example',443)
        with patch.object(loop,'getaddrinfo',AsyncMock(return_value=answers[:1])):
            result=await security.PublicResolver().resolve('allowed.example',443);assert result[0]['host']=='8.8.8.8' and result[0]['flags']==socket.AI_NUMERICHOST
    asyncio.run(check())
def test_gcm_nonce_aad_tampering_and_rotation(monkeypatch):
    secret='a fixture key only';encrypted=security.seal(secret,'owner-a','key-a');assert security.seal(secret,'owner-a','key-a')!=encrypted;assert security.unseal(encrypted,'owner-a','key-a')==secret
    for owner,key in [('owner-b','key-a'),('owner-a','key-b')]:
        with pytest.raises(InvalidTag):security.unseal(encrypted,owner,key)
    version,raw=encrypted.split('.',1);payload=bytearray(base64.b64decode(raw));payload[-1]^=1
    with pytest.raises(InvalidTag):security.unseal(version+'.'+base64.b64encode(payload).decode(),'owner-a','key-a')
    monkeypatch.setattr(settings,'master_keys',{**settings.master_keys,'v2':base64.b64encode(b'2'*32).decode()});monkeypatch.setattr(settings,'active_key','v2');assert security.seal(secret,'owner-a','key-a').startswith('v2.');assert security.unseal(encrypted,'owner-a','key-a')==secret
@pytest.mark.parametrize('name',['../escape.py','/etc/passwd','a/../../escape.py','.env','a//x.txt','a/./x.txt','a\\x.txt','c:evil.txt','bad\x00.txt'])
def test_unsafe_paths(name):assert not security.safe_path(name)
def zipped(files,mode=None):
    b=io.BytesIO();
    with zipfile.ZipFile(b,'w',compression=zipfile.ZIP_DEFLATED) as a:
        for name,contents in files.items():
            info=zipfile.ZipInfo(name)
            if mode is not None:info.create_system=3;info.external_attr=mode<<16
            a.writestr(info,contents)
    return b.getvalue()
def test_skill_archive_normalization_and_frozen_text():
    result=security.parse_skill('example.zip',zipped({'example/SKILL.md':'A useful fixture skill.','example/scripts/draw.py':'print("fixture")'}));assert set(result)=={'SKILL.md','scripts/draw.py'};assert security.parse_skill('test.md',b'A useful fixture skill.')=={'SKILL.md':'A useful fixture skill.'}
@pytest.mark.parametrize('files',[{'../SKILL.md':'A useful fixture skill.'},{'SKILL.md':b'\xff\x00'},{'SKILL.md':'valid fixture','binary.exe':'not allowed'},{'missing.txt':'A useful fixture skill.'},{'SKILL.md':'x'*65537},{'SKILL.md':'short'}])
def test_bad_skills_are_rejected(files):
    with pytest.raises(HTTPException):security.parse_skill('bad.zip',zipped(files))
def test_skill_symlinks_and_bombs_rejected():
    with pytest.raises(HTTPException):security.parse_skill('bad.zip',zipped({'SKILL.md':'A fixture only.'},stat.S_IFLNK|0o777))
    with pytest.raises(HTTPException):security.parse_skill('bad.zip',b'x'*(256*1024+1))
    with pytest.raises(HTTPException):security.parse_skill('bad.zip',b'not a zip')
def production_settings(**kwargs):
    fields=dict(production=True,database_url='postgresql+psycopg://unused',app_origin='https://app.example.com',preview_origin='https://preview.example.net',master_keys={'v1':base64.b64encode(b'1'*32).decode()},signing_key=base64.b64encode(b'3'*32).decode(),smtp_host='mail.example.com');fields.update(kwargs);return Settings(**fields)
@pytest.mark.parametrize('kwargs',[{'database_url':'sqlite:///unsafe.db'},{'preview_origin':'https://preview.example.com'},{'app_origin':'http://app.example.com'},{'sandbox_runtime':'runc'},{'master_keys':{}},{'smtp_host':''},{'signing_key':'too-short'}])
def test_production_refuses_unsafe_defaults(kwargs):
    with pytest.raises(ValueError):production_settings(**kwargs).validate()
def test_preview_never_needs_decryption_keys():
    value=production_settings(role='preview',master_keys={},smtp_host='').validate();assert not value.master_keys
    with pytest.raises(ValueError):production_settings(role='preview').validate()
def test_development_preview_does_not_generate_local_secrets(tmp_path,monkeypatch):
    monkeypatch.chdir(tmp_path)
    value=Settings(role='preview',production=False,database_url='sqlite:///unused.db',app_origin='http://localhost:8080',preview_origin='http://127.0.0.1:8001',master_keys={},signing_key=base64.b64encode(b'3'*32).decode()).validate()
    assert value.master_keys=={} and value.allowed_bases==[]
    assert not (tmp_path/'.local').exists()
def test_body_size_limit(client):
    r=client.post('/api/auth/login',content=b'x'*(512*1024+1),headers={'Content-Type':'application/json'});assert r.status_code==413
