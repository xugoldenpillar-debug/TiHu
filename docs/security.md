# TiHu security boundaries

TiHu deliberately separates **trusted control-plane services** from **untrusted model execution** and **untrusted browser artifacts**.

## Provider credentials

Provider keys are AES-256-GCM encrypted at rest. A key is bound through AEAD associated data to both the account and credential ID. The API returns only metadata and the final four characters. The worker decrypts a key only after claiming a run. The guest never receives that key: it receives a random, single-run broker token instead.

The credential broker accepts only the selected model, a bounded number of requests, bounded payload/response sizes, text-only remote inputs, and a restricted set of provider capabilities. Provider bases are allowlisted HTTPS origins. DNS answers are resolved by the trusted process and any private/special-use result rejects the request. IP-literal provider URLs are rejected.

This is **not zero-knowledge key storage**. The trusted worker can decrypt keys to contact providers. Recommend dedicated low-limit testing keys and provider-side spend caps.

## Guest execution

Production requires gVisor (`runsc`) on dedicated worker machines. Each run starts a new container with: no network, no Docker socket, read-only root filesystem, non-root UID, all Linux capabilities dropped, `no-new-privileges`, CPU/memory/PID/open-file/time limits, bounded tmpfs, and bounded artifact output. The only host mount is a read-only directory containing that run's Unix-domain broker socket.

The worker needs access to the host Docker daemon, so **do not colocate it with sensitive workloads**. The API and preview services do not need Docker access. Failed/interrupted jobs are not automatically retried because provider requests may already have been billed.

## Skill uploads

Skill archives are small, text-only and normalized. TiHu rejects path traversal, dotfiles, drive/absolute paths, symlinks/special files, encrypted members, excessive expansion ratios, duplicate paths and oversized files. A root `SKILL.md` is mandatory.

## HTML previews

Preview artifacts are served from a separate origin by a service that has the database signing key but **no provider-key decryption keys**. Signed links expire after five minutes. The preview CSP includes `sandbox allow-scripts` without `allow-same-origin`, blocks connect/forms/objects/frames/workers, and restricts embedding to the configured main application origin. The parent iframe also sets `sandbox="allow-scripts"` and no referrer.

A browser sandbox is not a complete network firewall: top-level/self navigation behavior varies among browsers. Never put secrets in generated artifacts. For higher assurance, render screenshots in a separate networkless browser service instead of executing arbitrary artifacts in visitors' browsers.

## Abuse / rankings

Votes are unique by account/run/board, authors cannot self-vote, and production can require verified/aged accounts. Model leaderboards take one best result per author/challenge/version/provider/model/track/environment before aggregating support. These reduce simple abuse but do not stop coordinated voting; the board is community preference, not a scientific intelligence benchmark.
