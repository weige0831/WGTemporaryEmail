# Deployment

Deploy WGTemporaryEmail on any VPS with Docker support.

**Live demo: https://mail.twcdk.com** · **API reference: https://mail.twcdk.com/api**

## Prerequisites

- Domain name with DNS access (MX record required to receive mail)
- VPS with a public IP; ports **25** and **80** reachable (**443** for panel HTTPS)
- Docker + Docker Compose, ~1 GB RAM (add swap on small VPS), a few GB of disk

## Quick deployment (setup.sh)

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

The script will:

1. Ask for your receive domains, mail hostname, web port, CORS origins, TLS options
2. Generate `config.yaml` (with a random admin token), `.env` (DB password, web port)
3. Print the DNS records to create
4. Run `docker compose up -d --build`

## Manual deployment

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# edit config.yaml (domains, server.hostname, admin.token, database password)
# edit .env (DB_PASSWORD is mandatory, WEB_PORT defaults to 80)
mkdir -p certs
docker compose up -d --build
```

The first visit opens the **setup wizard** at `/setup` (the example config ships with
`setup.initialized: false`), where the same values can be filled in the browser. `setup.sh`
writes `setup.initialized: true` because it already collected everything interactively.

## DNS records

```
mail.your-domain.com.   IN  A    YOUR_VPS_IP     # mail hostname
your-domain.com.        IN  MX  10 mail.your-domain.com.
```

Also ask your VPS provider to set the reverse DNS (PTR) of the server IP to `mail.your-domain.com`.

Wait for DNS propagation (5-60 minutes) before testing.

## Ports

| Port | Service | Purpose |
|---|---|---|
| 25 | mx | SMTP reception (must be publicly reachable) |
| 80 | web | user panel, admin panel, API, ACME challenges |
| 443 | web | panel HTTPS (optional but recommended) |
| 8000 / 5432 | api / postgres | internal Docker network only |

## TLS certificates

- Issue from the admin panel: 系统配置 → TLS card → email → 签发 / 续期证书
- HTTP-01 via the webroot served by nginx (`/.well-known/acme-challenge/`)
- The SAN certificate covers the mail hostname and the panel domain (`web.hostname`)
- Renewals run automatically every day; renewed certs apply to both the MX
  (lazy per-handshake loading) and nginx (auto reload) without restarts
- Toggle `tls.enabled` to enable STARTTLS on the MX - hot-reloaded within 15s

## Panel access domain & IP access control

- `web.hostname`: the official panel domain (e.g. `mail.your-domain.com`); add its
  A record to the server
- `web.allow_ip_access` (default true): when off, requests to the user site from
  other domains or IPs are redirected to the official domain. `/admin`, `/api/*`,
  `/docs` and the ACME challenge path always remain reachable so you can never
  lock yourself out

## Verify deployment

```bash
docker compose ps                     # all containers healthy
curl http://localhost/api/v1/health   # API through nginx
curl http://localhost/api/v1/domains  # configured domains
```

Then open `http://your-ip/` (or the panel domain), finish the setup wizard and send
a test mail from an external mailbox.

## Log & disk cleanup

Mail data is auto-cleaned by the application itself (expired addresses + `max_storage_mb`
cap, see [docs/admin-panel.md](admin-panel.md)). Host-level accumulation is handled by:

- **Container logs**: every compose service sets `max-size: 10m / max-file: 3`; `setup.sh`
  also writes `/etc/docker/daemon.json` with the same defaults so other containers
  (e.g. unrelated projects on the same host) rotate too
- **journald**: capped at 200M via `/etc/systemd/journald.conf`
- **Scheduled pruning**: `/etc/cron.d/wgtempemail-cleanup` runs `docker system prune`
  + `docker builder prune` weekly and `apt-get autoclean` monthly

One-off manual cleanup:

```bash
apt-get clean                 # apt cache
docker builder prune -f       # build cache
journalctl --vacuum-size=200M
```

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

## Uninstalling

```bash
docker compose down -v   # -v deletes all mail data
```

## Troubleshooting

- **Emails not arriving**: check `dig MX your-domain.com`, `telnet mail.your-domain.com 25`,
  `docker compose logs mx`, and that the address exists (`POST /api/v1/addresses`)
- **Certificate issuance fails**: the mail hostname's A record must point to this
  server and port 80 must be publicly reachable; check `docker logs tempmail_certbot`
- **Panel shows a redirect**: `web.allow_ip_access` is off and you used a non-official
  host - use the official panel domain (the admin panel still works from any host)

## Upgrading an existing installation

```bash
git pull
docker compose exec -T postgres psql -U tempmail -d tempmail < db/migrations/002_permanent_addresses.sql
docker compose build
docker compose up -d --force-recreate
```

Migrations live in `db/migrations/` and are idempotent. Run them when upgrading an installation created before the matching feature; a fresh install gets the full schema from `db/init/schema.sql`.

## Low-disk deployments (prebuilt frontend)

`web/Dockerfile` runs `npm ci && next build` inside the build, which needs
roughly 1 GB of scratch space. On a small VPS that already holds mail data this
can fail with `ENOSPC: no space left on device`.

Build the static export on a workstation instead and ship only the output:

```bash
# workstation
cd web && npm ci && npm run build          # produces web/out
tar -czf webprebuilt.tar.gz -C web out Dockerfile.runtime locations.conf entrypoint.sh
scp webprebuilt.tar.gz root@server:/root/

# server
cd /root/tempmail-server/web && tar -xzf /root/webprebuilt.tar.gz
cd /root/tempmail-server
docker compose build api mx                # no npm involved
mkdir -p /root/webimg && cp -r web/out web/locations.conf web/entrypoint.sh     web/Dockerfile.runtime /root/webimg/
docker build -f /root/webimg/Dockerfile.runtime -t tempmail-server-web /root/webimg
docker compose up -d --no-build
```

Note: build from a clean context (`/root/webimg`) - `web/.dockerignore` excludes
`out/`, so building with `web/` as the context cannot see the export.
