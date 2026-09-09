"""Configuration. Production fails closed instead of generating secret defaults."""
import base64
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit


def env_int(name: str, default: int, lo: int, hi: int) -> int:
    value = int(os.getenv(name, str(default)))
    if not lo <= value <= hi:
        raise ValueError(f"{name} must be between {lo} and {hi}")
    return value


def validate_origin(name: str, value: str):
    try:
        url = urlsplit(value)
        _ = url.port
    except ValueError as exc:
        raise ValueError(f"{name} must be a valid HTTP(S) origin") from exc
    if url.scheme not in ('http', 'https') or not url.hostname or url.path not in ('', '/') or url.query or url.fragment or url.username or url.password:
        raise ValueError(f"{name} must be an HTTP(S) origin without credentials, path, query or fragment")


@dataclass
class Settings:
    role: str = field(default_factory=lambda: os.getenv('TIHU_ROLE', 'api'))
    production: bool = field(default_factory=lambda: os.getenv('TIHU_ENV') == 'production')
    database_url: str = field(default_factory=lambda: os.getenv('DATABASE_URL', 'sqlite:///./.local/tihu.db'))
    app_origin: str = field(default_factory=lambda: os.getenv('APP_ORIGIN', 'http://localhost:8000').rstrip('/'))
    preview_origin: str = field(default_factory=lambda: os.getenv('PREVIEW_ORIGIN', 'http://127.0.0.1:8001').rstrip('/'))
    master_keys: dict = field(default_factory=lambda: json.loads(os.getenv('MASTER_KEYS', '{}')))
    active_key: str = field(default_factory=lambda: os.getenv('ACTIVE_KEY_ID', 'v1'))
    signing_key: str = field(default_factory=lambda: os.getenv('SIGNING_KEY', ''))
    allowed_bases: list = field(default_factory=lambda: os.getenv('PROVIDER_BASES', 'https://api.openai.com/v1,https://api.anthropic.com/v1,https://api.deepseek.com/v1,https://openrouter.ai/api/v1,https://generativelanguage.googleapis.com/v1beta/openai').split(','))
    sandbox_image: str = field(default_factory=lambda: os.getenv('SANDBOX_IMAGE', 'tihu-sandbox:0.1'))
    sandbox_runtime: str = field(default_factory=lambda: os.getenv('SANDBOX_RUNTIME', 'runsc'))
    broker_root: str = field(default_factory=lambda: os.getenv('BROKER_ROOT', '/tmp/tihu-brokers'))
    concurrency: int = field(default_factory=lambda: env_int('WORKER_CONCURRENCY', 2, 1, 32))
    run_seconds: int = field(default_factory=lambda: env_int('RUN_SECONDS', 180, 20, 600))
    max_calls: int = field(default_factory=lambda: env_int('MAX_MODEL_CALLS', 12, 1, 30))
    max_output_tokens: int = field(default_factory=lambda: env_int('MAX_OUTPUT_TOKENS', 4096, 256, 16384))
    daily_runs: int = field(default_factory=lambda: env_int('DAILY_RUNS', 20, 1, 1000))
    user_active: int = field(default_factory=lambda: env_int('USER_ACTIVE_RUNS', 2, 1, 10))
    max_queue: int = field(default_factory=lambda: env_int('MAX_QUEUE', 500, 1, 10000))
    smtp_host: str = field(default_factory=lambda: os.getenv('SMTP_HOST', ''))
    smtp_port: int = field(default_factory=lambda: int(os.getenv('SMTP_PORT', '587')))
    smtp_user: str = field(default_factory=lambda: os.getenv('SMTP_USER', ''))
    smtp_password: str = field(default_factory=lambda: os.getenv('SMTP_PASSWORD', ''))
    mail_from: str = field(default_factory=lambda: os.getenv('MAIL_FROM', 'TiHu <noreply@example.com>'))
    registration: bool = field(default_factory=lambda: os.getenv('REGISTRATION_OPEN', 'true') == 'true')
    vote_age: int = field(default_factory=lambda: int(os.getenv('VOTE_MIN_AGE_SECONDS', '600')))

    def validate(self):
        validate_origin('app_origin', self.app_origin)
        validate_origin('preview_origin', self.preview_origin)
        if self.app_origin == self.preview_origin:
            raise ValueError('Preview must be a separate origin')
        if self.production:
            if not self.database_url.startswith('postgresql'):
                raise ValueError('Production requires PostgreSQL')
            hosts = [urlsplit(x).hostname for x in (self.app_origin, self.preview_origin)]
            if any(not x.startswith('https://') for x in (self.app_origin, self.preview_origin)):
                raise ValueError('Production origins must use HTTPS')
            if hosts[0].split('.')[-2:] == hosts[1].split('.')[-2:]:
                raise ValueError('Use unrelated application and preview domains')
            if self.role != 'preview' and self.sandbox_runtime != 'runsc':
                raise ValueError('Production requires the gVisor runsc runtime')
            if self.role == 'api' and self.registration and not self.smtp_host:
                raise ValueError('Open production registration requires SMTP verification')
        if self.production and self.role == 'preview':
            if not self.signing_key or len(base64.b64decode(self.signing_key, validate=True)) != 32:
                raise ValueError('Preview requires a 32-byte SIGNING_KEY')
            if self.master_keys:
                raise ValueError('Never give decryption keys to the preview service')
            self.allowed_bases = []
            return self
        if not self.master_keys or not self.signing_key:
            if self.production:
                raise ValueError('MASTER_KEYS and SIGNING_KEY are required')
            root = Path('.local')
            root.mkdir(mode=0o700, parents=True, exist_ok=True)
            secret_path = root / 'dev-secrets.json'
            if not secret_path.exists():
                data = json.dumps({'master': base64.b64encode(os.urandom(32)).decode(), 'sign': base64.b64encode(os.urandom(32)).decode()})
                try:
                    fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, 'w') as out:
                        out.write(data)
                except FileExistsError:
                    pass
            secrets_data = json.loads(secret_path.read_text())
            self.master_keys = self.master_keys or {self.active_key: secrets_data['master']}
            self.signing_key = self.signing_key or secrets_data['sign']
        if self.active_key not in self.master_keys:
            raise ValueError('ACTIVE_KEY_ID missing from MASTER_KEYS')
        for secret in [*self.master_keys.values(), self.signing_key]:
            if len(base64.b64decode(secret, validate=True)) != 32:
                raise ValueError('Secrets must encode exactly 32 random bytes')
        self.allowed_bases = [x.strip().rstrip('/') for x in self.allowed_bases if x.strip()]
        return self

    @property
    def cookie(self):
        return '__Host-tihu_session' if self.production else 'tihu_session'


settings = Settings().validate()
