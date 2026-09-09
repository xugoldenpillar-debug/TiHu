# TiHu

TiHu is a community **BYOK model playground**: people create reusable challenges, connect their own provider key, choose a discovered model, optionally add prompt templates and `SKILL.md` bundles, and run one fresh **pi 0.85.1** coding-agent experiment. Generated HTML stays private until the author previews and publishes it. The community can vote independently on **capability** and **funny** boards, including model-level rankings.

This directory is a **functional reconstruction from preserved source history after the original temporary workspace was lost**. It is not claimed to be byte-for-byte identical to the vanished working tree. The important security architecture, database model, endpoints, worker/broker contract, frontend workflow and preserved regression behavior have been rebuilt and re-tested.

## Architecture

```text
Browser -> Caddy/static web -> FastAPI API -> PostgreSQL
                                      |
                                      +-> durable run queue
                                             |
                                   dedicated Worker (Docker authority)
                                             |
                                 runsc / gVisor guest, no network
                                             |
                                 per-run Unix-socket broker
                                             |
                                        model provider

Browser -> unrelated Preview origin -> signed, CSP-sandboxed artifact
```

The real provider key is AES-256-GCM encrypted and only decrypted in trusted worker memory. A guest receives a random per-run broker token, never the real key. See `docs/security.md` before deployment.

## Features

- Registration/login, Argon2id passwords, server sessions, CSRF and origin checks, verification/reset token plumbing.
- Multiple encrypted API connections, provider allowlist, SSRF-hardened model discovery, model selection.
- Versioned community challenges and three honest starter challenges (no fake results/scores).
- Private prompt-template library and restricted `SKILL.md`/ZIP library.
- Immutable run snapshots, idempotent admission, per-user active/daily quotas, queue backpressure.
- PostgreSQL `SKIP LOCKED` worker claims, leases/heartbeats, no automatic paid retry.
- pi 0.85.1 guest with fixed resource/tool contract; per-run credential broker.
- Private HTML/source preview, explicit publish/unpublish, capability/funny votes, comments and reports.
- Work and model boards separated by task version, track and execution-environment hash.
- Responsive dependency-free TypeScript frontend and separate preview service.

## Development start

Requirements: Python 3.12+, Node/TypeScript for rebuilding the frontend, Docker, Compose, and **gVisor** if you want to execute model jobs.

```bash
python scripts/generate_env.py
# Build frontend after editing web/app.ts
tsc
# Build the fixed pi guest image
docker compose --profile build-only build sandbox-image
# Start PostgreSQL, API, preview, worker and frontend
docker compose up --build -d
```

Open `http://localhost:8080`. Preview links use `http://127.0.0.1:8001` by default.

Without Docker/gVisor you can still run the API regression suite locally:

```bash
pip install -r requirements.txt
pytest -q --disable-warnings
```

## Production

Read `docs/security.md` and `docs/deployment.md`. Public launch is blocked until real gVisor execution, Unix-socket broker transport, real provider calls, unrelated HTTPS preview origin, email/anti-abuse, secret management, image scanning and target-load testing have been verified.

Community votes are **preference signals, not objective intelligence scores**.
