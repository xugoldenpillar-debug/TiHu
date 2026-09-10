"""Application operations. Admission, snapshots and votes are transactional."""
import base64, binascii, json, math, re, secrets
from fastapi import HTTPException
from sqlalchemy import case, func, insert, or_, select
from . import db
from .config import settings
from .security import password_hasher, stable_hash

ACTIVE = ('queued', 'running')
PI_VERSION = '0.85.1'

def require_row(c, table, ident, owner_id=None):
    condition = table.c.id == ident
    if owner_id is not None: condition &= table.c.owner_id == owner_id
    result = db.row(c, select(table).where(condition))
    if not result: raise HTTPException(404, 'not_found')
    return result

def visible_run(c, ident, user=None):
    result = require_row(c, db.runs, ident)
    is_owner = user and result['owner_id'] == user['id']; is_admin = user and user['role'] == 'admin'
    if not (is_owner or is_admin or (result['published'] and not result['hidden'] and result['status'] == 'succeeded')): raise HTTPException(404, 'not_found')
    return result

def admission_lock(c):
    if c.dialect.name == 'sqlite': c.exec_driver_sql('BEGIN IMMEDIATE')
    else: c.execute(select(db.locks.c.id).where(db.locks.c.id == 1).with_for_update())

def harness():
    return {'agent': 'pi', 'version': PI_VERSION, 'image': settings.sandbox_image, 'runtime': settings.sandbox_runtime, 'seconds': settings.run_seconds, 'calls': settings.max_calls, 'output_tokens_per_call': settings.max_output_tokens, 'cpu': 1, 'memory_mb': 512, 'pids': 96, 'network': 'none', 'tools': ['read', 'write', 'edit', 'bash'], 'system_prompt_version': '1'}

def quota(c, user_id):
    cutoff = db.now() - 86400
    active = c.execute(select(func.count()).select_from(db.runs).where(db.runs.c.owner_id == user_id, db.runs.c.status.in_(ACTIVE))).scalar_one()
    daily = select(db.runs.c.created).where(db.runs.c.owner_id == user_id, db.runs.c.created >= cutoff)
    used = c.execute(select(func.count()).select_from(daily.subquery())).scalar_one()
    next_available = None
    if used >= settings.daily_runs:
        next_available = c.execute(daily.order_by(db.runs.c.created, db.runs.c.id).offset(used - settings.daily_runs).limit(1)).scalar_one() + 86400
    return {'active': active, 'active_limit': settings.user_active, 'daily_used': used, 'daily_limit': settings.daily_runs, 'daily_remaining': max(0, settings.daily_runs - used), 'next_available_at': next_available}

def paginate(c, statement, created, ident, cursor, limit, descending=False):
    total = c.execute(select(func.count()).select_from(statement.subquery())).scalar_one()
    if cursor:
        try:
            timestamp, key = json.loads(base64.b64decode(cursor + '=' * (-len(cursor) % 4), altchars=b'-_', validate=True))
            if type(timestamp) not in (int, float) or not math.isfinite(timestamp) or not isinstance(key, str) or not re.fullmatch(r'[a-f0-9]{32}', key): raise ValueError()
        except (ValueError, TypeError, OverflowError, binascii.Error, UnicodeDecodeError):
            raise HTTPException(422, 'invalid_cursor')
        boundary = or_(created < timestamp, (created == timestamp) & (ident < key)) if descending else or_(created > timestamp, (created == timestamp) & (ident > key))
        statement = statement.where(boundary)
    ordering = (created.desc(), ident.desc()) if descending else (created.asc(), ident.asc())
    items = db.rows(c, statement.order_by(*ordering).limit(limit + 1))
    more = len(items) > limit
    items = items[:limit]
    next_cursor = base64.urlsafe_b64encode(json.dumps([items[-1]['created'], items[-1]['id']], separators=(',', ':')).encode()).decode().rstrip('=') if more else None
    return {'items': items, 'next_cursor': next_cursor, 'total': total}

def vote_reason(run, user):
    if not user: return 'authentication_required'
    if not user['verified']: return 'verification_required'
    if user['suspended']: return 'account_suspended'
    if db.now() - user['created'] < settings.vote_age: return 'account_too_new'
    if run['owner_id'] == user['id']: return 'cannot_vote_own_work'
    if not run['published'] or run['hidden'] or run['status'] != 'succeeded': return 'work_not_public'
    return None

def decorate_summaries(c, items, user):
    votes = {}
    if user and items:
        for run_id, kind in c.execute(select(db.votes.c.run_id, db.votes.c.kind).where(db.votes.c.run_id.in_([x['id'] for x in items]), db.votes.c.user_id == user['id'])):
            votes.setdefault(run_id, []).append(kind)
    for item in items:
        item['my_votes'] = sorted(votes.get(item['id'], []))
        item['can_manage'] = bool(user and user['id'] == item['owner_id'])
        item['is_official'] = bool(item.get('provider') in settings.allowed_bases)
    return items

def enqueue(user_id, body, idempotency):
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,80}', idempotency or ''): raise HTTPException(422, 'idempotency_key_required')
    fingerprint = stable_hash(body)
    with db.engine.begin() as c:
        admission_lock(c)
        prior = db.row(c, select(db.runs).where(db.runs.c.owner_id == user_id, db.runs.c.idempotency == idempotency))
        if prior:
            if prior['fingerprint'] != fingerprint: raise HTTPException(409, 'idempotency_conflict')
            return {'id': prior['id'], 'status': prior['status'], 'reused': True}
        account = require_row(c, db.users, user_id)
        if account['suspended']: raise HTTPException(403, 'account_suspended')
        if not account['verified']: raise HTTPException(403, 'verification_required')
        key = require_row(c, db.credentials, body['key_id'], user_id)
        version = require_row(c, db.versions, body['version_id']); challenge = require_row(c, db.challenges, version['challenge_id'])
        if challenge['archived']: raise HTTPException(409, 'challenge_archived')
        if body['model'] not in key['models']: raise HTTPException(422, 'refresh_and_select_model')
        selected = [require_row(c, db.skills, ident, user_id) for ident in sorted(set(body.get('skill_ids', [])))]
        if len(selected) > 4 or sum(len(str(x['files'])) for x in selected) > 300000: raise HTTPException(422, 'too_many_skills')
        remaining = quota(c, user_id)
        queued = c.execute(select(func.count()).select_from(db.runs).where(db.runs.c.status == 'queued')).scalar_one()
        if remaining['active'] >= remaining['active_limit']: raise HTTPException(429, 'active_run_limit')
        if remaining['daily_remaining'] == 0: raise HTTPException(429, 'daily_run_limit')
        if queued >= settings.max_queue: raise HTTPException(503, 'queue_full', headers={'Retry-After': '30'})
        prompt = body.get('prompt', '').strip(); thinking = body.get('thinking', 'off')
        track = 'standard' if not selected and not prompt and thinking == 'off' else 'open'
        snapshot = {'challenge_prompt': version['prompt'], 'rubric': version['rubric'], 'version_hash': version['sha256'], 'prompt': prompt, 'thinking': thinking, 'harness': harness(), 'base_url': key['base_url'], 'protocol': key['protocol'], 'model': body['model'], 'skills': [{'id': x['id'], 'name': x['name'], 'sha256': x['sha256'], 'files': x['files']} for x in selected]}
        ident = db.uid(); environment = stable_hash(snapshot['harness'])
        c.execute(insert(db.runs).values(id=ident, owner_id=user_id, challenge_id=challenge['id'], version_id=version['id'], key_id=key['id'], model=body['model'], provider=key['base_url'], track=track, environment=environment, status='queued', snapshot=snapshot, fingerprint=fingerprint, idempotency=idempotency, created=db.now()))
        db.log(c, ident, 'queued', 'Waiting for an isolated runner. No provider request has been made.'); db.audit_log(c, user_id, 'run.created', ident)
        return {'id': ident, 'status': 'queued', 'reused': False}

def vote_counts():
    return select(db.votes.c.run_id, func.sum(case((db.votes.c.kind == 'capability', 1), else_=0)).label('capability'), func.sum(case((db.votes.c.kind == 'funny', 1), else_=0)).label('funny')).group_by(db.votes.c.run_id).subquery()

def run_query(detail=False):
    vc = vote_counts(); fields = [db.runs.c[x] for x in ('id','owner_id','challenge_id','version_id','model','provider','track','environment','status','published','hidden','created','started','finished','error','metrics')]
    if detail: fields.append(db.runs.c.snapshot)
    thumbnail = select(db.thumbnails.c.run_id).where(db.thumbnails.c.run_id == db.runs.c.id).exists().label('thumbnail_available')
    return select(*fields, thumbnail, db.users.c.username, db.challenges.c.title, db.versions.c.number.label('version'), func.coalesce(vc.c.capability, 0).label('capability'), func.coalesce(vc.c.funny, 0).label('funny')).select_from(db.runs.join(db.users, db.runs.c.owner_id == db.users.c.id).join(db.challenges, db.runs.c.challenge_id == db.challenges.c.id).join(db.versions, db.runs.c.version_id == db.versions.c.id).outerjoin(vc, db.runs.c.id == vc.c.run_id))

def public_conditions(challenge=None, version=None, track='standard', model=None, days=0, latest=True, provider_scope='all'):
    filters = [db.runs.c.published.is_(True), db.runs.c.hidden.is_(False), db.runs.c.status == 'succeeded']
    if challenge: filters.append(db.runs.c.challenge_id == challenge)
    if version: filters.append(db.runs.c.version_id == version)
    elif latest: filters.append(db.versions.c.number == db.challenges.c.current_version)
    if track != 'all': filters.append(db.runs.c.track == track)
    if model: filters.append(db.runs.c.model == model)
    if days: filters.append(db.runs.c.created >= db.now() - days * 86400)
    if provider_scope == 'official':
        filters.append(db.runs.c.provider.in_(settings.allowed_bases))
    elif provider_scope == 'custom':
        filters.append(~db.runs.c.provider.in_(settings.allowed_bases))
    return filters

def leaderboard(c, kind, group, challenge, version, track, days, limit, environment=None, provider_scope='all'):
    base = run_query().where(*public_conditions(challenge, version, track, days=days, provider_scope=provider_scope), db.runs.c.environment == (environment or stable_hash(harness()))).subquery()
    if group == 'works':
        rows = db.rows(c, select(base).order_by(base.c[kind].desc(), base.c.created.asc(), base.c.id.asc()).limit(limit))
        for r in rows: r['is_official'] = bool(r.get('provider') in settings.allowed_bases)
        return rows
    ranked = select(base, func.row_number().over(partition_by=[base.c.owner_id, base.c.challenge_id, base.c.version_id, base.c.provider, base.c.model, base.c.track, base.c.environment], order_by=[base.c[kind].desc(), base.c.created.asc(), base.c.id]).label('rn')).subquery()
    rows = db.rows(c, select(ranked.c.provider, ranked.c.model, ranked.c.track, ranked.c.environment, func.sum(ranked.c[kind]).label('score'), func.count().label('entries'), func.count(func.distinct(ranked.c.owner_id)).label('authors'), func.count(func.distinct(ranked.c.challenge_id)).label('challenges')).where(ranked.c.rn == 1).group_by(ranked.c.provider, ranked.c.model, ranked.c.track, ranked.c.environment).order_by(func.sum(ranked.c[kind]).desc(), ranked.c.model, ranked.c.provider).limit(limit))
    for r in rows: r['is_official'] = bool(r.get('provider') in settings.allowed_bases)
    return rows

def seed():
    with db.engine.begin() as c:
        system = db.row(c, select(db.users).where(db.users.c.username == 'tihu-system'))
        if not system:
            system = {'id': db.uid()}; c.execute(insert(db.users).values(id=system['id'], username='tihu-system', email='system@tihu.invalid', password=password_hasher.hash(secrets.token_urlsafe(48)), role='system', verified=True, suspended=True, created=db.now()))
        tasks = [
            ('Pelican on a bicycle','The deceptively simple visual reasoning challenge. Anatomy, geometry, and a little personality.','SVG','Create a self-contained index.html featuring an original SVG of a pelican riding a bicycle. The pelican must visibly sit on the bicycle, with feet on pedals, two wheels, a coherent frame and a recognizable beak. Do not load external resources.','Recognizable pelican; coherent bicycle geometry; believable contact points; visual craft.'),
            ('A tiny living world','Build a beautiful interactive ecosystem inside a single HTML page.','Interactive','Build a self-contained index.html of an interactive miniature ecosystem. Use Canvas or SVG, include plants and creatures, a day/night control, and a pause button. Work without external resources.','Interaction quality; visual coherence; accessible controls; working animation.'),
            ('The impossible clock','An unexpectedly delightful clock that still tells the correct time.','Creative','Build a self-contained index.html with a surprising, playful clock. It must show the real local time accurately and offer a reduced-motion control. No external resources.','Correct time; originality; readability; reduced-motion support.')]
        for title, description, category, prompt, rubric in tasks:
            if c.execute(select(db.challenges.c.id).where(db.challenges.c.title == title)).first(): continue
            cid = db.uid(); c.execute(insert(db.challenges).values(id=cid, owner_id=system['id'], title=title, description=description, category=category, current_version=1, created=db.now())); c.execute(insert(db.versions).values(id=db.uid(), challenge_id=cid, number=1, prompt=prompt, rubric=rubric, sha256=stable_hash({'prompt': prompt, 'rubric': rubric}), created=db.now()))
