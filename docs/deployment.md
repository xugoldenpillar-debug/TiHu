# Production deployment checklist

Do not turn on public registration until every item below is verified on the target infrastructure.

1. Install Docker and gVisor; `docker info` must list `runsc`. Build `tihu-sandbox:0.1` and pin the resulting image digest operationally.
2. Put workers on dedicated machines. The worker has Docker-daemon authority. API, PostgreSQL and preview should not share that authority.
3. Create `/var/lib/tihu/brokers` on every worker host with restrictive ownership. The same absolute path is mounted into the worker because Docker bind-source paths are resolved by the host daemon.
4. Use PostgreSQL with encrypted backups. Store `MASTER_KEYS` and `SIGNING_KEY` in a real secret manager; keep old master-key versions during rotation/backup retention.
5. Use **unrelated HTTPS origins** for app and preview (for example `app.example.com` and `preview.example.net`). Set `APP_ORIGIN`/`PREVIEW_ORIGIN` exactly. The frontend CSP frame-src must name only the preview origin.
6. Configure SMTP before open registration. Add captcha/bot mitigation, email-domain/velocity rules and moderation operations before accepting public traffic.
7. Put an external reverse proxy/WAF in front of the API with request/concurrency limits. Scale API replicas statelessly; PostgreSQL is the source of truth. Scale workers horizontally; `SKIP LOCKED` distributes queued runs.
8. Add metrics/alerts for queue depth, run duration/failure reason, broker calls, provider HTTP status, PostgreSQL saturation, worker disk/CPU/memory, and moderation/report queues. Never log API keys, prompts by default, cookies or broker tokens.
9. Load test with **mock providers first**. Then run controlled real-provider tests with dedicated capped keys. Verify gVisor + host Unix socket + pi 0.85.1 end-to-end before public traffic.
10. Scan/pin images and dependencies, run CI, and perform a security review/penetration test.
