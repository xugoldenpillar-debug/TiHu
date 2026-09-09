"""Schema v1 and transactional persistence. SQLAlchemy Core; PostgreSQL in production."""
import time
import uuid
from pathlib import Path
from sqlalchemy import Boolean, Column as C, Float, ForeignKey as FK, Index, Integer, JSON, MetaData, String, Table, Text, UniqueConstraint, create_engine, event, insert, select
from .config import settings

metadata = MetaData()

def uid(): return uuid.uuid4().hex
def now(): return time.time()
def col_id(): return C('id', String(32), primary_key=True)
def owner(): return C('owner_id', String(32), FK('users.id'), nullable=False, index=True)

users = Table('users', metadata, col_id(), C('username', String(32), unique=True, nullable=False), C('email', String(254), unique=True, nullable=False), C('password', Text, nullable=False), C('role', String(16), nullable=False, default='user'), C('verified', Boolean, nullable=False, default=False), C('suspended', Boolean, nullable=False, default=False), C('created', Float, nullable=False))
sessions = Table('sessions', metadata, C('digest', String(64), primary_key=True), owner(), C('expires', Float, nullable=False, index=True), C('created', Float, nullable=False))
tokens = Table('tokens', metadata, C('digest', String(64), primary_key=True), owner(), C('purpose', String(16), nullable=False), C('expires', Float, nullable=False))
credentials = Table('credentials', metadata, col_id(), owner(), C('label', String(60), nullable=False), C('base_url', String(300), nullable=False), C('protocol', String(24), nullable=False), C('sealed', Text, nullable=False), C('last4', String(4), nullable=False), C('models', JSON, nullable=False, default=list), C('created', Float, nullable=False))
skills = Table('skills', metadata, col_id(), owner(), C('name', String(80), nullable=False), C('files', JSON, nullable=False), C('sha256', String(64), nullable=False), C('created', Float, nullable=False))
prompt_templates = Table('prompt_templates', metadata, col_id(), owner(), C('name', String(80), nullable=False), C('body', Text, nullable=False), C('created', Float, nullable=False))
challenges = Table('challenges', metadata, col_id(), owner(), C('title', String(100), nullable=False), C('description', Text, nullable=False), C('category', String(30), nullable=False), C('current_version', Integer, nullable=False), C('archived', Boolean, nullable=False, default=False), C('created', Float, nullable=False))
versions = Table('versions', metadata, col_id(), C('challenge_id', String(32), FK('challenges.id'), nullable=False, index=True), C('number', Integer, nullable=False), C('prompt', Text, nullable=False), C('rubric', Text, nullable=False), C('sha256', String(64), nullable=False), C('created', Float, nullable=False), UniqueConstraint('challenge_id', 'number'))
runs = Table('runs', metadata, col_id(), owner(), C('challenge_id', String(32), FK('challenges.id'), nullable=False), C('version_id', String(32), FK('versions.id'), nullable=False), C('key_id', String(32), FK('credentials.id', ondelete='SET NULL')), C('model', String(200), nullable=False), C('provider', String(300), nullable=False), C('track', String(12), nullable=False), C('environment', String(64), nullable=False), C('status', String(16), nullable=False), C('published', Boolean, nullable=False, default=False), C('hidden', Boolean, nullable=False, default=False), C('snapshot', JSON, nullable=False), C('fingerprint', String(64), nullable=False), C('idempotency', String(80), nullable=False), C('lease', String(32)), C('heartbeat', Float), C('created', Float, nullable=False), C('started', Float), C('finished', Float), C('error', String(200)), C('metrics', JSON, nullable=False, default=dict), UniqueConstraint('owner_id', 'idempotency'))
Index('runs_queue', runs.c.status, runs.c.created)
Index('runs_gallery', runs.c.published, runs.c.hidden, runs.c.challenge_id, runs.c.version_id, runs.c.track, runs.c.created)
Index('runs_environment', runs.c.environment, runs.c.track, runs.c.published)
Index('runs_owner_status', runs.c.owner_id, runs.c.status, runs.c.created)
artifacts = Table('artifacts', metadata, C('run_id', String(32), FK('runs.id'), primary_key=True), C('files', JSON, nullable=False), C('sha256', String(64), nullable=False), C('size', Integer, nullable=False))
events = Table('events', metadata, C('id', Integer, primary_key=True, autoincrement=True), C('run_id', String(32), FK('runs.id'), nullable=False, index=True), C('kind', String(40), nullable=False), C('message', String(400), nullable=False), C('created', Float, nullable=False))
votes = Table('votes', metadata, C('run_id', String(32), FK('runs.id'), primary_key=True), C('user_id', String(32), FK('users.id'), primary_key=True), C('kind', String(12), primary_key=True), C('created', Float, nullable=False))
Index('votes_kind_run', votes.c.kind, votes.c.run_id)
comments = Table('comments', metadata, col_id(), owner(), C('run_id', String(32), FK('runs.id'), nullable=False, index=True), C('body', Text, nullable=False), C('hidden', Boolean, nullable=False, default=False), C('created', Float, nullable=False))
reports = Table('reports', metadata, col_id(), owner(), C('run_id', String(32), FK('runs.id'), nullable=False), C('reason', String(500), nullable=False), C('resolved', Boolean, nullable=False, default=False), C('created', Float, nullable=False), UniqueConstraint('owner_id', 'run_id'))
audit = Table('audit', metadata, C('id', Integer, primary_key=True, autoincrement=True), C('actor', String(32)), C('action', String(50), nullable=False), C('target', String(100)), C('created', Float, nullable=False))
buckets = Table('buckets', metadata, C('key', String(160), primary_key=True), C('used', Integer, nullable=False), C('reset', Float, nullable=False, index=True))
locks = Table('locks', metadata, C('id', Integer, primary_key=True))
schema = Table('schema_version', metadata, C('version', Integer, primary_key=True))

def make_engine(url):
    if url.startswith('sqlite'):
        if '///' in url and ':memory:' not in url:
            Path(url.split('///', 1)[1]).parent.mkdir(parents=True, exist_ok=True)
        e = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 30})
        @event.listens_for(e, 'connect')
        def sqlite_setup(conn, _):
            conn.execute('PRAGMA foreign_keys=ON'); conn.execute('PRAGMA journal_mode=WAL'); conn.execute('PRAGMA busy_timeout=30000')
    else:
        e = create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=10, pool_timeout=10)
    return e

engine = make_engine(settings.database_url)

def init():
    metadata.create_all(engine)
    with engine.begin() as c:
        if c.execute(select(schema.c.version)).scalar_one_or_none() is None: c.execute(insert(schema).values(version=1))
        if c.execute(select(locks.c.id)).scalar_one_or_none() is None: c.execute(insert(locks).values(id=1))

def check_schema():
    with engine.connect() as c:
        if c.execute(select(schema.c.version)).scalar_one() != 1: raise RuntimeError('Unsupported schema version; migrate before starting TiHu')

def row(c, statement):
    item = c.execute(statement).mappings().first(); return dict(item) if item else None

def rows(c, statement): return [dict(x) for x in c.execute(statement).mappings()]
def log(c, run_id, kind, message): c.execute(insert(events).values(run_id=run_id, kind=kind, message=message[:400], created=now()))
def audit_log(c, actor, action, target=None): c.execute(insert(audit).values(actor=actor, action=action, target=target, created=now()))
