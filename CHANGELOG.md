# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.9] - 2026-09-23

### Changed

- **`server.max_messages_per_hour_per_ip: 0` now really means "no limit".**
  Previously a 0 in the config fell back to the 300/hour default (the getter
  could not tell "unset" from "zero"), so an operator could not switch the guard
  off. The key is now optional: absent -> 300 (defensive default), present and
  0/negative -> unlimited. `server.max_mime_parts` follows the same rule.
- The MX logs the effective values at startup
  (`Per-IP message limit: 300/hour` or `unlimited`) so the setting is verifiable
  from `docker compose logs mx`.

### Why

A large sender pool (AWS SES, used by Twitch: 55 source IPs in 54.240.26.0/24)
delivering ~17k mails/hour saturates a per-IP cap: each IP reached 300 in the
hour and the overflow was rejected with "per-IP message rate limit exceeded"
(1500 rejections observed). The guard is advisory infrastructure, not a spam
filter - DKIM/SPF/DMARC results are still recorded only and never cause a
rejection.

## [1.1.8] - 2026-09-23

### Fixed

- **Service hang caused by database connection-pool exhaustion.** The pool was
  small (5 + 10 overflow) and saturation left the API unable to serve requests:
  creations timed out and `pg_stat_activity` showed the pooled sessions held
  while requests could not proceed. Recovery only needed the pool to be freed,
  so the surrounding safeguards are now in place:

  - **capacity raised to 100** (`pool_size: 20` kept warm + `max_overflow: 80`),
    and Postgres `max_connections` raised to 200 so 100 API connections plus the
    MX's pool actually fit.
  - **Postgres reaps leaked transactions**: `idle_in_transaction_session_timeout
    = 60s` (plus TCP keepalives), so a transaction left open by a hung request
    can never hold a slot forever again.
  - **Fail fast instead of queuing**: `pool_timeout` 30s -> 10s, and
    `pool_reset_on_return: rollback` is now explicit.
  - **Pool watchdog**: a background thread warns (and dumps every thread stack)
    once 80% of the pool is in use, and logs when it recovers.
  - **Stack dumps on demand**: `FAULTHANDLER_SECONDS` (default 120 in compose)
    makes Python print all thread stacks to the container log periodically, so a
    future hang can be diagnosed from `docker compose logs api` instead of
    guesswork.

### Verified

- After the change: 30 concurrent mailbox reads and repeated creations all
  succeed; pooled sessions return to zero checked out; the idle-in-transaction
  count observed during traffic consists of sub-second, in-request states.
- End-to-end re-check: permanent mailbox creation, token login, inbox read,
  temporary address creation, admin stats and the permanent-address page all
  work.

## [1.1.7] - 2026-09-23

### Changed

- **Temporary address creation: 50 per minute per IP** (was 30, originally 10).
- **API-key authenticated permanent-mailbox creation is no longer rate limited
  by default** (`rate_limits.api_create_per_minute: 0`). The key is the
  credential and total growth is bounded by `tempmail.max_permanent_addresses`;
  set a positive value to re-enable a limit, or 0 to disable it again.
- The nginx edge limit is bypassed for that path too (`/api/v1/api/` gets its
  own location without `limit_req`), otherwise the 120/min edge bucket would
  still cap API-key creation.
- Docs, config example and the admin panel hint reflect both values; 4 new tests
  pin the defaults (144 total).

## [1.1.6] - 2026-09-23

### Changed

- **Rate limits are now configurable and less strict for creation.** The old
  fixed values (10 address creations/min, 5 permanent mailbox creations/min per
  IP) were easy to hit in normal use - especially behind a shared NAT, or when
  the operator tests alongside automation on the same public IP. New defaults:
  30/min for temporary addresses, 20/min for permanent mailboxes, 60/min for the
  API-key route, 120/min for the admin API and 300/min for mailbox reads.
- All limits live in `config.yaml` under `rate_limits:` (0 disables one) and are
  editable in the admin panel (**System config -> Rate limits**) with immediate
  effect - the limiter reads the value on every request, no restart needed.
- The temp-mailbox and permanent-mailbox pages now explain a 429 clearly
  ("the limit is per IP address, please wait about a minute") instead of showing
  a generic failure, in all 16 languages.

## [1.1.5] - 2026-09-23

### Added

- **Dedicated permanent-address management page in the admin panel**
  (`/admin/mailboxes`, nav entry "永久地址"): overview cards (mailbox count,
  emails and unread count, storage, retention window with a "run cleanup now"
  button), a creation form that returns the access token once, and a list with
  per-mailbox email count, unread count, storage, creation and last-delivery
  time plus search and paging.
- Per-mailbox actions: **purge emails** (keep the address) and **delete
  mailbox** (address and all emails, with confirmation).
- Five new admin endpoints backing the page: `GET/POST
  /api/v1/admin/permanent-addresses`, `GET .../stats`,
  `POST .../{id}/purge-emails`, `POST .../run-retention` - all authenticated and
  documented on the `/api` docs page (which now covers 37 endpoints).
- Localized page and API descriptions in all 16 languages.

### Fixed

- The new permanent-address list applied its filters only to the count query,
  so the page body listed every address; caught by the new tests.
- Tests: 10 new cases for the management endpoints (136 total).

## [1.1.4] - 2026-09-22

### Fixed

- **React hydration error #418 ("hydration failed because the server rendered
  text didn't match the client")** on every page for non-English visitors: the
  statically exported HTML is built with the default language (the build cannot
  read localStorage), while the client rendered the stored language on its very
  first pass, so every translated string mismatched. The provider now renders
  the default language first and applies the stored one in a layout effect,
  which runs after hydration but **before the browser paints** - the mismatch is
  gone and the chosen language still appears without an English flash.
- Time-dependent text (the "last refreshed HH:MM:SS" line on the permanent
  mailbox page) is no longer part of the prerendered HTML, which was a second
  hydration mismatch source.
- Home page search now searches on Enter, matching the permanent mailbox page
  (previously it waited for the next 15 s auto-refresh).

### Verified

Full functional sweep against the live deployment: temp mailbox (create, copy,
inbox, search hit/miss, reader with HTML/plain toggle, DKIM/SPF/DMARC badges,
delete, new-address dialog), permanent mailbox (create, token panel, show/hide
token, inbox, reader, logout, token login, invalid token rejected), admin panel
(dashboard, emails, addresses with permanent badge, domains, config with masked
secrets, cleanup overview + manual run), API docs page (all 32 endpoints listed,
one-click test returning HTTP 200), 16-language switching incl. RTL Arabic,
theme toggle, MX delivery to both mailbox types, and the public/admin API
surface.

## [1.1.3] - 2026-09-21

### Fixed

- **"Application error: a client-side exception" on the first visit to a page,
  gone after a refresh.** The static HTML was served without any `Cache-Control`,
  so browsers cached it heuristically; every rebuild renames the JS chunk files,
  and the cached HTML then referenced chunks that no longer exist. Filenames are
  now served with an explicit policy:
  - documents (`/`, `/mailbox`, ...): `Cache-Control: no-cache` (revalidate every
    load, 304 when unchanged)
  - `/_next/static/*` (content-hashed): `public, max-age=31536000, immutable`
  - `/admin` and `/api/*` responses: `no-store`
- Security headers moved into a shared include (`/etc/nginx/security-headers.conf`)
  because nginx drops inherited `add_header` directives in any location that
  defines its own - the new cache headers would otherwise have silently removed
  HSTS/CSP/X-Frame-Options from those locations. Verified 5/5 headers on `/`,
  `/admin` and `/api/*`.

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
