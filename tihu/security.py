"""Trust boundaries: cryptography, authentication, archive validation and SSRF-safe egress."""
import asyncio, base64, hashlib, hmac, io, ipaddress, json, re, secrets, socket, stat, zipfile
from pathlib import PurePosixPath
from urllib.parse import urlsplit, urlparse
import aiohttp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError, VerificationError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from . import db
from .config import settings

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(24))

def digest(value: str) -> str: return hashlib.sha256(value.encode()).hexdigest()
def stable_hash(value) -> str: return digest(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True))
def sign(value: str) -> str: return hmac.new(base64.b64decode(settings.signing_key), value.encode(), hashlib.sha256).hexdigest()

def seal(secret: str, owner: str, key_id: str) -> str:
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(base64.b64decode(settings.master_keys[settings.active_key])).encrypt(nonce, secret.encode(), f'{owner}:{key_id}'.encode())
    return f'{settings.active_key}.{base64.b64encode(nonce + encrypted).decode()}'

def unseal(value: str, owner: str, key_id: str) -> str:
    version, data = value.split('.', 1); raw = base64.b64decode(data, validate=True)
    return AESGCM(base64.b64decode(settings.master_keys[version])).decrypt(raw[:12], raw[12:], f'{owner}:{key_id}'.encode()).decode()

def verify_password(encoded: str, password: str) -> bool:
    try: return password_hasher.verify(encoded, password)
    except (VerifyMismatchError, InvalidHashError, VerificationError): return False

def throttle(key: str, limit: int, seconds: int):
    now = db.now(); bucket = f'{key}:{int(now // seconds)}'
    with db.engine.begin() as c:
        factory = sqlite_insert if c.dialect.name == 'sqlite' else pg_insert
        statement = factory(db.buckets).values(key=bucket, used=1, reset=now + seconds).on_conflict_do_update(index_elements=['key'], set_={'used': db.buckets.c.used + 1})
        c.execute(statement); used = c.execute(select(db.buckets.c.used).where(db.buckets.c.key == bucket)).scalar_one()
    if used > limit: raise HTTPException(429, 'rate_limit', headers={'Retry-After': str(seconds)})

def canonical_base(value: str, allow_custom: bool = False) -> str:
    value = value.strip().rstrip('/')
    try:
        parsed = urlsplit(value); port = parsed.port
    except ValueError:
        raise HTTPException(422, 'invalid_provider_url') from None
    if parsed.scheme != 'https' or not parsed.hostname or port not in (None, 443) or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(422, 'invalid_provider_url')
    if '%' in value or '\\' in value or '..' in parsed.path or '//' in parsed.path or any(ord(c) < 33 for c in value):
        raise HTTPException(422, 'invalid_provider_url')
    try: ipaddress.ip_address(parsed.hostname)
    except ValueError: pass
    else: raise HTTPException(422, 'provider_ip_literal_denied')
    normalized = f'https://{parsed.hostname.lower()}{parsed.path}'
    if not allow_custom and normalized not in settings.allowed_bases: raise HTTPException(422, 'provider_not_allowlisted')
    return normalized
def public_ip(value: str) -> bool:
    ip = ipaddress.ip_address(value)
    if not ip.is_global or ip.is_multicast or ip.is_unspecified: return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped or ip in ipaddress.ip_network('64:ff9b::/96') or ip in ipaddress.ip_network('64:ff9b:1::/48') or ip in ipaddress.ip_network('2002::/16'): return False
    return True

class PublicResolver(aiohttp.abc.AbstractResolver):
    async def resolve(self, host, port=0, family=socket.AF_UNSPEC):
        results = await asyncio.get_running_loop().getaddrinfo(host, port, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
        if not results or any(not public_ip(r[4][0]) for r in results): raise OSError('Private or special-use provider address denied')
        return [{'hostname': host, 'host': r[4][0], 'port': port, 'family': r[0], 'proto': r[2], 'flags': socket.AI_NUMERICHOST} for r in results]
    async def close(self): pass

def outbound_session(total: float | None = None, connect: float = 15, sock_read: float | None = 120):
    return aiohttp.ClientSession(connector=aiohttp.TCPConnector(resolver=PublicResolver(), use_dns_cache=False, force_close=True), timeout=aiohttp.ClientTimeout(total=total, connect=connect, sock_read=sock_read), trust_env=False)

def auth_headers(protocol: str, key: str) -> dict:
    return {'x-api-key': key, 'anthropic-version': '2023-06-01'} if protocol == 'anthropic' else {'Authorization': f'Bearer {key}'}
def resolve_models_endpoint(base: str, protocol: str) -> str:
    base = base.rstrip('/')
    if protocol == 'anthropic':
        return base + ('/models' if base.endswith('/v1') else '/v1/models')
    if protocol == 'responses':
        return base + ('/models' if base.endswith('/v1') else '/v1/models')
    path = urlparse(base).path
    if not path or path == '/':
        return base + '/v1/models'
    return base + '/models'

async def discover(base: str, protocol: str, key: str) -> list[str]:
    base = canonical_base(base, allow_custom=True)
    endpoint = resolve_models_endpoint(base, protocol)
    try:
        async with outbound_session(total=60, connect=15, sock_read=30) as client:
            async with client.get(endpoint, headers=auth_headers(protocol, key), allow_redirects=False) as response:
                if response.status != 200: raise HTTPException(502, f'provider_models_http_{response.status}')
                data = bytearray()
                async for chunk in response.content.iter_chunked(16384):
                    data.extend(chunk)
                    if len(data) > 16 * 1024 * 1024: raise HTTPException(502, 'provider_response_too_large')
                payload = json.loads(data)
                if not isinstance(payload, dict): raise ValueError('invalid model response')
                values = payload.get('data', payload.get('models', []))
                if not isinstance(values, list): raise ValueError('invalid model list')
                ids = [x.get('id', x.get('name', '')) for x in values if isinstance(x, dict)]
                return sorted(set(x for x in ids if isinstance(x, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}', x)))[:500]
    except HTTPException: raise
    except (aiohttp.ClientError, OSError, ValueError, asyncio.TimeoutError): raise HTTPException(502, 'provider_unreachable') from None

ALLOWED_SKILL_SUFFIXES = {'.md', '.txt', '.json', '.py', '.js', '.mjs', '.sh', '.html', '.css', '.svg', '.yaml', '.yml'}
def safe_path(path: str) -> bool:
    p = PurePosixPath(path)
    return bool(path) and len(path) <= 180 and not p.is_absolute() and '\\' not in path and ':' not in path and not any(x in ('', '.', '..') or x.startswith('.') for x in path.split('/')) and not any(ord(x) < 32 for x in path)

def parse_skill(filename: str, data: bytes) -> dict:
    if len(data) > 256 * 1024: raise HTTPException(413, 'skill_too_large')
    result = {}
    if filename.lower().endswith('.md'): result = {'SKILL.md': data}
    elif filename.lower().endswith('.zip'):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                infos = archive.infolist()
                if len(infos) > 40: raise ValueError('too many entries')
                total = 0
                for info in infos:
                    name = info.filename.rstrip('/')
                    if not safe_path(name): raise ValueError('unsafe path')
                    mode = (info.external_attr >> 16) & 0xFFFF
                    if mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR): raise ValueError('special file')
                    if info.is_dir(): continue
                    if name in result or info.flag_bits & 1 or info.file_size > 65536 or info.file_size > max(info.compress_size * 100, 4096): raise ValueError('unsafe archive')
                    total += info.file_size
                    if total > 256 * 1024: raise ValueError('expanded archive too large')
                    result[name] = archive.read(info)
        except (ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError): raise HTTPException(422, 'unsafe_skill_archive') from None
        if 'SKILL.md' not in result and result:
            roots = {x.split('/')[0] for x in result}
            if len(roots) == 1 and all('/' in x for x in result): result = {x.split('/', 1)[1]: value for x, value in result.items()}
    else: raise HTTPException(422, 'upload_md_or_zip')
    if 'SKILL.md' not in result or len(result) > 30: raise HTTPException(422, 'skill_md_required')
    try:
        decoded = {}
        for path, body in result.items():
            if not safe_path(path) or PurePosixPath(path).suffix.lower() not in ALLOWED_SKILL_SUFFIXES or len(body) > 65536: raise ValueError('unsupported file')
            decoded[path] = body.decode('utf-8')
            if '\x00' in decoded[path]: raise ValueError('binary file')
        if len(decoded['SKILL.md'].strip()) < 10: raise ValueError('empty skill')
        return decoded
    except (ValueError, UnicodeError): raise HTTPException(422, 'skill_text_files_only') from None

ALLOWED_ARTIFACT_SUFFIXES = {'.html', '.css', '.js', '.mjs', '.json', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.webp'}
UNSAFE_PATTERNS = [
    (re.compile(r'(?:window\s*\.\s*)?(?:top|parent)\s*(?:\.\s*location|\[\s*[\'"`]location[\'"`]\s*\])', re.IGNORECASE),
     '尝试操作顶级窗口或父级容器 (Frame-busting)'),
    (re.compile(r'location\s*\.\s*(?:replace|assign|href)\s*\(?.*(?:parent|top)', re.IGNORECASE),
     '尝试对上层窗口执行重定向跳转'),
    (re.compile(r'document\s*\.\s*cookie', re.IGNORECASE),
     '尝试读取或窃取浏览器 Cookie 凭据'),
]

def parse_uploaded_artifact(filename: str, data: bytes) -> dict[str, str]:
    if not data:
        raise HTTPException(422, 'empty_artifact_payload')
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(413, 'artifact_bundle_too_large')
    result: dict[str, bytes] = {}
    lower_fn = filename.lower()
    if lower_fn.endswith('.html'):
        if len(data) > 512 * 1024:
            raise HTTPException(413, 'artifact_file_too_large')
        result = {'index.html': data}
    elif lower_fn.endswith('.zip'):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                infos = archive.infolist()
                if len(infos) > 50:
                    raise ValueError('too many entries')
                total = 0
                for info in infos:
                    name = info.filename.rstrip('/')
                    if not safe_path(name):
                        raise ValueError('unsafe path')
                    mode = (info.external_attr >> 16) & 0xFFFF
                    if mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
                        raise ValueError('special file')
                    if info.is_dir():
                        continue
                    if name in result or info.flag_bits & 1 or info.file_size > 512 * 1024 or info.file_size > max(info.compress_size * 100, 4096):
                        raise ValueError('unsafe archive entry')
                    total += info.file_size
                    if total > 2 * 1024 * 1024:
                        raise ValueError('expanded archive too large')
                    result[name] = archive.read(info)
        except (ValueError, zipfile.BadZipFile, RuntimeError, NotImplementedError):
            raise HTTPException(422, 'unsafe_artifact_archive') from None
        if 'index.html' not in result and result:
            roots = {x.split('/')[0] for x in result}
            if len(roots) == 1 and all('/' in x for x in result):
                result = {x.split('/', 1)[1]: value for x, value in result.items()}
    else:
        raise HTTPException(422, 'upload_html_or_zip')

    if 'index.html' not in result:
        raise HTTPException(422, 'index_html_required')
    if not (1 <= len(result) <= 50):
        raise HTTPException(422, 'artifact_file_limit')

    encoded: dict[str, str] = {}
    for path, body in result.items():
        if not safe_path(path):
            raise HTTPException(422, 'unsafe_artifact_path')
        if PurePosixPath(path).suffix.lower() not in ALLOWED_ARTIFACT_SUFFIXES:
            raise HTTPException(422, 'artifact_type_denied')
        if len(body) > 512 * 1024:
            raise HTTPException(413, 'artifact_file_too_large')
        encoded[path] = base64.b64encode(body).decode()
    return encoded

def inspect_artifact_safety(files: dict[str, str]) -> tuple[bool, str]:
    for path, enc in files.items():
        ext = PurePosixPath(path).suffix.lower()
        if ext in {'.html', '.js', '.mjs', '.svg'}:
            try:
                raw = base64.b64decode(enc, validate=True)
                text = raw.decode('utf-8', errors='ignore')
            except Exception:
                return False, f'文件 {path} 编码异常'
            for pat, desc in UNSAFE_PATTERNS:
                if pat.search(text):
                    return False, f'文件 {path} 检测到潜在恶意代码：{desc}'
    return True, ''
