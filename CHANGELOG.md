# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-09-21

Security and completeness release: fixes every issue raised by a full
project-wide audit (backend, SMTP server, frontend, deployment, documentation).

### Security

- **Integration API key is no longer exposed**: `GET /api/v1/admin/config` masks
  every secret-looking key (token/api_key/secret/password) instead of only the
  database password and admin token, and the admin panel redacts secret fields a
  second time before rendering the raw config.
- **HTTPS is enforced** when TLS is enabled (HTTP requests are 301-redirected,
  Let's Encrypt challenge paths excluded) and the generated nginx config now sets
  HSTS, `X-Frame-Options: DENY`, a CSP, `Referrer-Policy` and
  `X-Content-Type-Options: nosniff`, plus `server_tokens off`.
- **Mailbox tokens no longer reach the logs**: nginx logs a redacted request URI
  (`/api/v1/<token>/...`) and the API container runs uvicorn with `--no-access-log`.
- **First-run takeover closed**: while an instance is uninitialized the setup
  wizard additionally requires a one-time setup key that the server prints at
  startup (`docker compose logs api | grep 'Setup key'`).
- **Certificate job injection fixed**: hostnames are validated against a strict
  DNS pattern and passed to certbot as separate arguments instead of being
  word-split into the command line; the certbot job directory is no longer
  world-writable.
- **File permissions**: `config.yaml` 640 (never 666), `.env` 600, `certs/` 750,
  TLS private keys 640; `certs/` and `generated_dns.txt` are now gitignored, and
  the previously committed `api/.coverage` was removed.
- **SMTP hardening**: DKIM verification is capped (`MaxVerifications`) and every
  DNS lookup runs under a timeout, so one message can no longer spawn unbounded
  goroutines and lookups; duplicate `RCPT TO` addresses are stored once; mail to
  an expired address is rejected; permanent/transient failures now return correct
  5xx/4xx SMTP codes instead of misleading replies.
- **Rate limiting**: the in-memory limiter now evicts stale keys, read endpoints
  (`/{token}/*`) are limited too, and nginx adds edge limits for `/api/`,
  `/api/v1/setup/` and `/api/v1/admin/`.
- **Safer defaults**: CORS defaults to no origins and `allow_credentials: false`
  (a wildcard combined with credentials is refused); the public health endpoint
  no longer lists configured domains; addresses are only generated with a CSPRNG.
- **Containers**: two networks split the frontend from the database, `api` and
  `mx` run read-only with `cap_drop: ALL` and `no-new-privileges`, and every
  service has memory/pid limits. The web container mounts `certs/` read-only and
  keeps its self-signed placeholder inside the image.
- **Attachment downloads**: filenames are emitted per RFC 6266 (non-ASCII names
  used to return HTTP 500, a quote could break the header), the MIME type is only
  honoured for render-inert types, and `nosniff` is always sent.

### Fixed

- Deleting an email removed the shared message row for every recipient; it now
  deletes only that mailbox's copy and drops the message once unreferenced
  (same for the permanent-mailbox retention cleanup and the MX per-address
  quota).
- `db/migrations/002_permanent_addresses.sql` now also creates the
  `addresses_type_check` constraint, so an upgraded database matches a fresh
  install; the two migration files no longer share the number `001`.
- Health check in `api/Dockerfile` probed a non-existent path.
- `setup.sh` reported the Let's Encrypt failure branch as dead code under `set -e`
  and left certificates without a renewal job - both fixed (renewal cron is
  installed, certificate files are republished after renewal).
- Version numbers in `package.json`/`main.py` were still 1.0.0 while tags were at
  v1.1.0.

### Documentation

- All 16 READMEs document permanent mailboxes, the integration API key, the
  retention setting, database migrations and backup/restore.
- The `/api` docs page covers all 32 endpoints (was 22) and can send the
  `X-API-Key` header; `server.docs_enabled: false` now really disables
  `/docs`, `/redoc` and `/openapi.json` at the edge.
- `docs/security.md`, `docs/api-server.md`, `docs/mx-server.md` and
  `docs/deployment*.md` were corrected where they contradicted the code.
- The privacy page mentions permanent mailboxes; the panel's remaining hardcoded
  Chinese/English strings (error messages, relative times, uptime) are localized.

### Testing

- 21 new backend tests cover the admin API, the integration key, the setup
  wizard, the permanent-mailbox lifecycle and shared-message deletion (111 total).

## [1.1.0] - 2026-09-21

### Added

- **Permanent mailboxes**: addresses kept forever, emails removed after
  `tempmail.permanent_email_retention_days` (default 30 days).
  - `/mailbox` page: create by username, save the access token, sign in with it;
    inbox/reader layout identical to the temporary mailbox.
  - `POST /api/v1/permanent-addresses` (public, rate limited) and
    `POST /api/v1/api/addresses` (requires `X-API-Key`).
  - Admin panel card to view/regenerate the integration API key.
- **Disk auto-cleanup**: container log rotation (10 MB x 3), journald capped at
  200 MB, weekly Docker prune, monthly apt autoclean - documented in every README.

### Fixed

- Admin address list returned 500 when a permanent mailbox was present.
- Active-address statistics excluded permanent mailboxes.
- Wrong admin token reported "session expired" instead of an invalid-token error.

## [1.0.0] - 2026-09-05

First stable release: tempmail-server + mailbucket integrated with a multilingual
admin panel, setup wizard, TLS automation, access control and security hardening.
