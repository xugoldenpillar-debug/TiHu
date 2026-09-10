# Production deployment checklist

Do not turn on public registration until every item below is verified on the target infrastructure.

1. Install Docker and gVisor; `docker info` must list `runsc`. Build both `tihu-sandbox:0.1` and `tihu-thumbnail:0.1`, and pin their resulting image digests operationally. `SANDBOX_IMAGE` and `THUMBNAIL_IMAGE` select these images; both guests use `SANDBOX_RUNTIME`.
2. Put workers on dedicated machines. The worker has Docker-daemon authority. API, PostgreSQL and preview should not share that authority.
3. Create `/var/lib/tihu/brokers` on every worker host with restrictive ownership. The same absolute path is mounted into the worker because Docker bind-source paths are resolved by the host daemon.
4. Use PostgreSQL with encrypted backups. Store `MASTER_KEYS` and `SIGNING_KEY` in a real secret manager; keep old master-key versions during rotation/backup retention.
5. Use **unrelated HTTPS origins** for app and preview (for example `app.example.com` and `preview.example.net`). Set `APP_ORIGIN`/`PREVIEW_ORIGIN` exactly. The frontend CSP frame-src must name only the preview origin.
6. Configure SMTP before open registration. Add captcha/bot mitigation, email-domain/velocity rules and moderation operations before accepting public traffic.
7. Put an external reverse proxy/WAF in front of the API with request/concurrency limits. Scale API replicas statelessly; PostgreSQL is the source of truth. Scale workers horizontally; `SKIP LOCKED` distributes queued runs.
8. Add metrics/alerts for queue depth, run duration/failure reason, broker calls, provider HTTP status, PostgreSQL saturation, worker disk/CPU/memory, and moderation/report queues. Never log API keys, prompts by default, cookies or broker tokens.
9. Load test with **mock providers first**. Then run controlled real-provider tests with dedicated capped keys. Verify gVisor + host Unix socket + pi 0.85.1 end-to-end before public traffic.
10. Scan/pin images and dependencies, run CI, and perform a security review/penetration test.

## Upgrading this version

Keep the existing `.env`, encryption/signing keys and PostgreSQL volume. Do not regenerate secrets or use `docker compose down -v` during an upgrade.

1. Back up PostgreSQL and confirm that no paid experiments are running before stopping workers. Interrupted experiments are not automatically retried.
2. Run `tsc` to rebuild every frontend module, then `docker compose --profile build-only build sandbox-image thumbnail-image` and `docker compose build api preview worker`.
3. With PostgreSQL healthy and workers stopped, run `docker compose run --rm --no-deps api python -m tihu.cli init`. This additive, idempotent initialization creates the Skill revision and thumbnail tables and backfills existing Skills as revision 1. It preserves frozen experiments, accounts, credentials, votes and artifacts.
4. Start services with `docker compose up -d`. Worker startup waits for the API health check and completed initialization. Reload the browser after replacing the static bundle.
5. Check a saved multi-file preview, model discovery with a dedicated testing key, run completion/cancellation, thumbnail creation and publication/withdrawal before admitting traffic.

Thumbnails are best-effort output for newly completed experiments; existing experiments without a thumbnail show an honest fallback rather than a fabricated image. The renderer image includes Chromium and adds substantial download/storage requirements. Each render is limited to 1 CPU, 768 MB memory, 192 PIDs, a 128 MB temporary filesystem and a 20-second worker deadline (18 seconds inside the guest). Failure leaves the successful artifact available.

Do not equate local smoke results with these production gates: real provider calls, SMTP delivery, unrelated HTTPS preview hosting, secret management, image scanning, anti-abuse operations and target-load testing still require infrastructure-specific verification.
