# WGTemporaryEmail

Ein datenschutzorientierter, selbst gehosteter Wegwerf-E-Mail-Dienst.

**Live-Demo: [https://mail.twcdk.com](https://mail.twcdk.com/)** · API-Referenz: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Admin-Panel: `https://mail.twcdk.com/admin`

WGTemporaryEmail ist aus zwei hervorragenden Open-Source-Projekten integriert und zu einem vollständigen, produktionsreifen Paket erweitert worden:

| Ausgangsprojekt | Rolle | Erweiterungen in diesem Projekt |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (FastAPI-API + Go-MX-Server + PostgreSQL) | Admin-API (`/api/v1/admin/*`) und Admin-Panel, Erststart-Assistent, Hot-Reload der Konfiguration, Hot-Reload des MX, Speicherlimit mit automatischer Bereinigung, Bugfixes (z. B. war `max_emails_per_address` fest verdrahtet), Sicherheitshärtung |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Nutzer-Frontend (Next.js 15) | In `web/` integriert, Same-Origin-API-Aufrufe, statischer Export über nginx, chinesisches Admin-Panel `/admin`, Erststart-Assistent `/setup`, XSS-Bereinigung (DOMPurify), i18n in 16 Sprachen |

Alle Projekte stehen unter der MIT-Lizenz; die ursprünglichen Urheberrechtshinweise bleiben erhalten. Danke an [Lm36](https://github.com/Lm36) für die großartige Arbeit.

## Funktionen

- **RFC-konformer MX-Server** - empfängt Post von jedem Anbieter auf Port 25
- **Nutzer-Frontend** - Posteingang, Anhänge, Download der Original-Mail, DKIM/SPF/DMARC-Badges, Dark Mode
- **Admin-Panel** (16 Sprachen) - Statistiken, E-Mail-/Adress-/Domain-Verwaltung, Hot-Konfigurationsupdates, manuelle Bereinigung
- **Erststart-Assistent** - Domains, Hostname, Admin-Token und Panel-Domain direkt im Browser einrichten
- **Let's-Encrypt-Automatisierung** - Ein-Klick-Ausstellung im Admin-Panel, automatische Erneuerung; MX und Panel-HTTPS teilen sich ein Zertifikat, Erneuerungen erfordern keinen MX-Neustart
- **Speicherkontrolle** - Limit `max_storage_mb`, älteste E-Mails werden automatisch gelöscht; zusätzlich E-Mail-Limit pro Adresse
- **Zugriffskontrolle** - Panel-Domain binden und IP-/Fremddomänen-Zugriff auf die Nutzerseite sperren; Admin-Panel und API bleiben immer erreichbar
- **Sicherheit** - Rate-Limiting, XSS-Bereinigung, SQL über ORM, Token-Vergleich in konstanter Zeit, Nicht-root-Container, DB-Passwort obligatorisch, keine schwachen Standardwerte
- **16 Sprachen** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Architektur

```
Internet
  │
  ├─ :25  ───────────────► mx     (Go-SMTP, lädt config.yaml alle 15 s neu)
  │
  └─ :80 / :443 ────────► web    (nginx: statisches Frontend + Reverse-Proxy)
       ├─ /                  Nutzer-Panel (16 Sprachen)
       ├─ /admin             Admin-Panel (16 Sprachen)
       ├─ /setup             Erststart-Assistent
       ├─ /api/* ──────────► api    (FastAPI, nur internes Netz)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (für den certbot-Sidecar)
            │
            └──► postgres (nur intern)
```

- `api` und `postgres` veröffentlichen keine Host-Ports; alles läuft über nginx.
- Der `certbot`-Sidecar stellt Zertifikate per HTTP-01-Webroot aus und erneuert sie; `web` lädt nginx bei Zertifikats- oder Konfigurationsänderungen automatisch neu.

## Deployment

### Voraussetzungen

- Eine Domain mit DNS-Zugriff (MX-Record ist für den Empfang erforderlich)
- Ein VPS mit öffentlicher IP; Ports **25** und **80** erreichbar (443 für Panel-HTTPS)
- Docker + Docker Compose, ca. 1 GB RAM (bei kleinen VPS Swap ergänzen), einige GB Festplatte

### Option A: interaktives Setup-Skript

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

Das Skript fragt Empfangsdomains, Mail-Hostname, Web-Port, CORS und TLS-Optionen ab, erzeugt `config.yaml` (mit zufälligem Admin-Token) und `.env`, zeigt die DNS-Records und führt `docker compose up -d --build` aus.

### Option B: manuelle Einrichtung

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) config.yaml bearbeiten: domains, server.hostname, admin.token, DB-Passwort
# 2) .env bearbeiten: DB_PASSWORD (Pflicht), WEB_PORT (Standard 80)
mkdir -p certs
docker compose up -d --build
```

Beim ersten Besuch öffnet sich der **Assistent /setup** (im Beispiel ist `setup.initialized: false`) – dort dieselben Werte im Browser eintragen.

### DNS-Records

```
mail.deine-domain.  IN  A    <Server-IP>      # Mail-Hostname
deine-domain.       IN  MX  10 mail.deine-domain.
```

Bitte auch den VPS-Anbieter bitten, das Reverse-DNS (PTR) der Server-IP auf `mail.deine-domain` zu setzen.

### TLS / Panel-HTTPS aktivieren

1. Admin-Panel → Systemkonfiguration → Panel-Zugriffsdomain: z. B. `mail.deine-domain` eintragen und deren A-Record im DNS auf den Server zeigen lassen
2. TLS-Zertifikatskarte → E-Mail eintragen → **Zertifikat ausstellen / erneuern** (das SAN-Zertifikat deckt Mail-Hostname und Panel-Domain ab)
3. `tls.enabled` einschalten – der MX startet STARTTLS sofort (ohne Neustart)
4. Panel-HTTPS wird automatisch auf 443 bereitgestellt; Erneuerung erfolgt vollautomatisch

### Zugriffskontrolle

Admin-Panel → Funktionsschalter → **Zugriff auf den Nutzerbereich per IP / anderen Domains erlauben**:

- AN (Standard): jede Adresse kann den Nutzerbereich erreichen
- AUS: Zugriffe über fremde Domains oder IPs werden auf die offizielle Panel-Domain umgeleitet; `/admin`, `/api/*`, `/docs` und der ACME-Challenge-Pfad bleiben von jeder Adresse erreichbar, sodass man sich nie aussperrt

### Aktualisieren

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Deinstallieren

```bash
docker compose down -v   # -v löscht auch alle Maildaten
```

## Admin-Panel und API

- Admin-Token: `admin.token` in `config.yaml` (erzeugt durch `setup.sh` oder den Assistenten)
- API-Referenz mit Ein-Klick-Livetests: `/api`; Swagger: `/docs`
- Siehe [docs/admin-panel.md](docs/admin-panel.md) und [docs/security.md](docs/security.md)

## Mehrsprachige Dokumentation

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Deployment-Anleitung](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Admin-Panel](docs/admin-panel.md) · [Sicherheit](docs/security.md)

## Lizenz

[MIT](LICENSE) – basierend auf [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) und [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (beide MIT).
