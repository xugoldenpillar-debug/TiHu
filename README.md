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

- Registration/login, Argon2id passwords, server sessions, CSRF/origin checks, verification/reset flows and resend-error guidance.
- Multiple encrypted API connections, provider allowlist, SSRF-hardened model discovery and linked model selection.
- Searchable, cursor-paginated challenges, public gallery and private experiment history; three starter challenges with no fabricated results or scores.
- Editable private prompt templates and immutable `SKILL.md`/ZIP revisions, including historical file inspection.
- Immutable run snapshots, idempotent admission, visible rolling 24-hour/concurrency quotas and queue backpressure.
- PostgreSQL `SKIP LOCKED` worker claims, leases/heartbeats, cancellation cleanup and no automatic paid retry.
- pi 0.85.1 guest with a fixed resource/tool contract and a per-run credential broker.
- Resumable, sanitized progress events; recorded provider Token usage distinguishes unknown/partial usage from zero. No fabricated price estimates.
- Separate-origin multi-file previews support bundle-local CSS, JavaScript modules, SVG and images; source files can be inspected or downloaded byte-for-byte.
- Real JPEG thumbnails captured from saved artifacts in a separate networkless gVisor guest. Missing/failed thumbnails are labelled explicitly and never invalidate a successful experiment.
- Explicit publication disclosure and withdrawal, capability/funny votes, comments, reports and moderation. Public responses omit private Skill file bodies and execution logs.
- Work/model boards separated by task version, track and environment fingerprint; time windows select newly created works, not recent votes. Side-by-side comparison exposes condition differences.
- Modular, dependency-free TypeScript frontend with responsive navigation, keyboard focus management, readable errors and accessible scroll regions.

## Development start

Requirements: Python 3.12+, Node/TypeScript for rebuilding the frontend, Docker, Compose, and **gVisor** if you want to execute model jobs.

```bash
python scripts/generate_env.py
# Rebuild all web/*.ts modules (TypeScript 5.8.3 or newer)
tsc
# Build both isolated guests before starting workers
docker compose --profile build-only build sandbox-image thumbnail-image
# Start PostgreSQL, API, preview, worker and frontend
docker compose up --build -d
```

Open `http://localhost:8080`. Preview links use `http://127.0.0.1:8001` by default.

Without Docker/gVisor you can still run the API regression suite locally:

```bash
pip install -r requirements.txt
pytest -q --disable-warnings
```

See `VALIDATION.json` for the exercised scope. Local verification includes PostgreSQL concurrency, real gVisor/pi/Unix-socket execution against a non-billable protocol fixture, real Chromium thumbnails, and desktop/mobile browser workflows. It does not establish production readiness or prove real paid-provider or SMTP delivery.

## Production

Read `docs/security.md` and `docs/deployment.md`. Public launch is blocked until real gVisor execution, Unix-socket broker transport, real provider calls, unrelated HTTPS preview origin, email/anti-abuse, secret management, image scanning and target-load testing have been verified.

Community votes are **preference signals, not objective intelligence scores**.
