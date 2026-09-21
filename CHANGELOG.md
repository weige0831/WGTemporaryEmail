# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-09-21

Second audit pass: closes the items that were still open after 1.1.1. Everything
below was verified on a live deployment.

### Security

- **The web container no longer holds `config.yaml`** (and therefore no database
  password or admin token): the API publishes just `WEB_HOSTNAME`, `ALLOW_IP`,
  `TLS_ENABLED` and `DOCS_ENABLED` into a shared volume that nginx reads.
- **Mailbox tokens are gone from nginx error logs too**: per-request error lines
  ("connect() failed ... /api/v1/<token>/...") used to leak the token even
  though access logs were redacted; the error log now records critical events only.
- **`web.allow_ip_access: false` without `web.hostname` is rejected** instead of
  silently serving every host (fail-open) while the panel claimed otherwise.
- **Public permanent-mailbox creation can be capped** with
  `tempmail.max_permanent_addresses` (0 = unlimited), limiting how far the
  unauthenticated endpoint can grow the database.
- **MX abuse limits**: `server.max_connections` (default 200) caps concurrent
  SMTP sessions, `server.max_messages_per_hour_per_ip` (default 300) caps mail
  floods from one address, and `server.max_mime_parts` (default 100) bounds
  parser work for messages built from thousands of tiny parts.
- **Placeholder database password is refused at startup** by both the API and
  the MX instead of running with a publicly known credential.
- The admin panel is excluded from search engines (`robots.txt` plus an
  `X-Robots-Tag: noindex` and `Cache-Control: no-store` on `/admin`).

### Fixed

- Deleting a mailbox's copy of a message can no longer remove another mailbox's
  copy through the MX per-address quota (recipient-level delete, orphan cleanup
  afterwards).
- MIME fields longer than their database columns (or containing NUL/invalid
  UTF-8) used to make the whole INSERT fail, bouncing legitimate mail with a
  permanent 554; they are now sanitized and truncated on a rune boundary.
- A transient 404 no longer discards the user's temporary address: the page
  confirms with `/info` before rotating, so mail is not lost to a proxy hiccup.
- Config writes are serialized, keep a `config.yaml.bak`, and the API falls back
  to it if the file is unreadable, so a crash mid-write cannot brick startup.
- Changes to CORS, the DB pool size and the max message size are reported as
  `restart_required` and surfaced in the panel (they are read at startup only).
- `cleanup_interval_hours` is re-read every round, so the panel value applies
  without a restart; username length bounds come from the config.
- TLS status uses the `openssl` CLI first and still degrades gracefully.
- Container base images are pinned (`alpine:3.21`, `certbot/certbot:v5.8.0`);
  web and certbot now have healthchecks; `setup.sh` validates domains,
  hostnames and numeric answers before writing YAML, and its weekly maintenance
  cron only prunes dangling images (no longer touching other projects).

### Testing

- 15 new tests (126 total) cover the mailbox cap, safe CORS defaults, rate-limit
  eviction, non-ASCII and quote-containing attachment filenames, the
  restart-required signal, the IP-access guard, config backup/recovery and
  configurable username bounds.

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
