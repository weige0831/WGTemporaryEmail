# WGTemporaryEmail

A privacy-first, self-hosted disposable temporary email service.

**Live demo: [https://mail.twcdk.com](https://mail.twcdk.com/)** · API reference: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Admin panel: `https://mail.twcdk.com/admin`

WGTemporaryEmail is integrated from two excellent open source projects and extended into a complete, production-ready package:

| Source project | Role | Extensions in this project |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (FastAPI API + Go MX server + PostgreSQL) | Admin API (`/api/v1/admin/*`) & admin panel, first-run setup wizard, config hot-reload, MX config hot-reload, storage cap with auto-cleanup, bug fixes (e.g. `max_emails_per_address` was hardcoded), security hardening |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | User frontend (Next.js 15) | Integrated into `web/`, same-origin API calls, static export served by nginx, Chinese admin panel `/admin`, first-run wizard `/setup`, XSS sanitization (DOMPurify), 16-language i18n |

All projects are MIT licensed; original copyright notices are preserved. Thanks to [Lm36](https://github.com/Lm36) for the great work.

## Features

- **RFC-compliant MX server** - receives mail from any provider on port 25
- **User frontend** - inbox, attachments, raw email download, DKIM/SPF/DMARC badges, dark mode
- **Admin panel** (16 languages) - statistics, email/address/domain management, hot config updates, manual cleanup
- **First-run setup wizard** - configure domains, hostname, admin token and panel domain from the browser
- **Let's Encrypt automation** - one-click issuance from the admin panel, automatic renewal, MX and panel HTTPS share one certificate; renewed certs apply without restarting the MX
- **Storage control** - `max_storage_mb` cap, oldest emails are cleaned automatically; per-address email limit
- **Access control** - bind a panel domain and block IP/other-domain access to the user site; admin panel & API always stay reachable
- **Security** - rate limiting, XSS sanitization, SQL via ORM, constant-time token compare, non-root containers, mandatory DB password, no weak defaults
- **16 languages** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Architecture

```
Internet
  │
  ├─ :25  ───────────────► mx     (Go SMTP, hot-reloads config.yaml every 15s)
  │
  └─ :80 / :443 ────────► web    (nginx: static frontend + reverse proxy)
       ├─ /                  user panel (mailbucket, 16 languages)
       ├─ /admin             admin panel (16 languages)
       ├─ /setup             first-run wizard
       ├─ /api/* ──────────► api    (FastAPI, internal network only)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (served for the certbot sidecar)
            │
            └──► postgres (internal only)
```

- `api` and `postgres` are not published to the host; everything goes through nginx.
- `certbot` sidecar issues and renews certificates via HTTP-01 webroot; `web` hot-reloads nginx on cert/config changes.

## Deployment

### Requirements

- A domain with DNS access (MX record required to receive mail)
- A VPS with a public IP; ports **25** and **80** reachable (443 for panel HTTPS)
- Docker + Docker Compose, ~1 GB RAM (add swap on small VPS), a few GB of disk

### Option A: interactive setup script

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

The script asks for your receive domains, mail hostname, web port, CORS origins, TLS options, then generates `config.yaml` (with a random admin token) and `.env`, prints the DNS records, and runs `docker compose up -d --build`.

### Option B: manual setup

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) edit config.yaml: domains, server.hostname, admin.token, database password
# 2) edit .env: DB_PASSWORD (mandatory), WEB_PORT (default 80)
mkdir -p certs
docker compose up -d --build
```

The first visit then opens the **setup wizard** at `/setup` (because `setup.initialized` is false by default in the example), where you fill the same values in the browser.

### DNS records

```
mail.your-domain.com.   IN  A    <server IP>      # mail hostname
your-domain.com.        IN  MX  10 mail.your-domain.com.
```

Also ask your VPS provider to set the reverse DNS (PTR) of the server IP to `mail.your-domain.com`.

### Enable TLS / panel HTTPS

1. Admin panel → 系统配置 → 面板访问域名: fill e.g. `mail.your-domain.com`, add its DNS A record to the server
2. TLS card → enter your email → **签发 / 续期证书** (the SAN cert covers both the mail hostname and the panel domain)
3. Toggle `tls.enabled` on — the MX starts STARTTLS immediately (no restart)
4. Panel HTTPS is served on 443 automatically; renewals are fully automatic

### Access control

Admin panel → 功能开关 → **允许通过 IP / 其他域名访问用户面板**:
- ON (default): any host can reach the user panel
- OFF: non-official domains and IPs are redirected to the official panel domain; `/admin`, `/api/*`, `/docs` and the ACME challenge stay reachable from any address so you can never lock yourself out

### Update

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Uninstall

```bash
docker compose down -v   # -v also deletes all mail data
```

## Admin panel & API

- Admin token: `admin.token` in `config.yaml` (generated by `setup.sh` / the setup wizard)
- API reference with live one-click tests: `/api` (docs page), Swagger: `/docs`
- See [docs/admin-panel.md](docs/admin-panel.md) and [docs/security.md](docs/security.md)

## Multi-language documentation

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Deployment guide](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Admin panel](docs/admin-panel.md) · [Security](docs/security.md)

## License

[MIT](LICENSE) — based on [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) and [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (both MIT).
