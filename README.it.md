# WGTemporaryEmail

Un servizio di e-mail temporanee usa e getta, self-hosted e incentrato sulla privacy.

**Demo live: [https://mail.twcdk.com](https://mail.twcdk.com/)** · Riferimento API: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Pannello di amministrazione: `https://mail.twcdk.com/admin`

WGTemporaryEmail è integrato a partire da due eccellenti progetti open source ed esteso fino a diventare un prodotto completo e pronto per la produzione:

| Progetto di origine | Ruolo | Estensioni in questo progetto |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (API FastAPI + server MX in Go + PostgreSQL) | API di amministrazione (`/api/v1/admin/*`) e pannello admin, procedura guidata di primo avvio, ricarica a caldo della configurazione, ricarica a caldo del MX, limite di archiviazione con pulizia automatica, correzioni di bug (es. `max_emails_per_address` era fisso), rafforzamento della sicurezza |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Frontend utente (Next.js 15) | Integrato in `web/`, chiamate API same-origin, export statico servito da nginx, pannello admin in cinese `/admin`, wizard iniziale `/setup`, sanitizzazione XSS (DOMPurify), i18n in 16 lingue |

Tutti i progetti sono sotto licenza MIT, con le note di copyright originali preservate. Grazie a [Lm36](https://github.com/Lm36) per l'ottimo lavoro.

## Funzionalità

- **Server MX conforme a RFC** - riceve posta da qualsiasi provider sulla porta 25
- **Frontend utente** - posta in arrivo, allegati, download dell'e-mail originale, badge DKIM/SPF/DMARC, modalità scura
- **Pannello di amministrazione** (16 lingue) - statistiche, gestione di e-mail/indirizzi/domini, aggiornamento a caldo della configurazione, pulizia manuale
- **Procedura guidata di primo avvio** - configura domini, hostname, token admin e dominio del pannello dal browser
- **Automazione Let's Encrypt** - emissione con un clic dal pannello, rinnovo automatico; MX e HTTPS del pannello condividono un certificato e i rinnovi non richiedono il riavvio del MX
- **Controllo dell'archiviazione** - limite `max_storage_mb`, le e-mail più vecchie vengono ripulite automaticamente; incluso il limite di e-mail per indirizzo
- **Controllo degli accessi** - associa un dominio del pannello e blocca l'accesso al sito utente da IP/altri domini; pannello admin e API restano sempre raggiungibili
- **Sicurezza** - rate limiting, sanitizzazione XSS, SQL tramite ORM, confronto di token a tempo costante, container non root, password DB obbligatoria, nessun default debole
- **16 lingue** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Architettura

```
Internet
  │
  ├─ :25  ───────────────► mx     (SMTP in Go, ricarica config.yaml ogni 15 s)
  │
  └─ :80 / :443 ────────► web    (nginx: frontend statico + reverse proxy)
       ├─ /                  pannello utente (16 lingue)
       ├─ /admin             pannello di amministrazione (16 lingue)
       ├─ /setup             wizard iniziale
       ├─ /api/* ──────────► api    (FastAPI, solo rete interna)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (per il sidecar certbot)
            │
            └──► postgres (solo interno)
```

- `api` e `postgres` non pubblicano porte sull'host; tutto passa da nginx.
- Il sidecar `certbot` emette e rinnova i certificati via HTTP-01 webroot; `web` ricarica nginx automaticamente al variare di certificato o configurazione.

## Distribuzione

### Requisiti

- Un dominio con accesso al DNS (il record MX è obbligatorio per ricevere posta)
- Un VPS con IP pubblico; porte **25** e **80** raggiungibili (443 per HTTPS del pannello)
- Docker + Docker Compose, ~1 GB di RAM (aggiungi swap sui VPS piccoli), qualche GB di disco

### Opzione A: script di installazione interattivo

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

Lo script chiede i domini di ricezione, l'hostname di posta, la porta web, CORS e le opzioni TLS, genera `config.yaml` (con token admin casuale) e `.env`, stampa i record DNS ed esegue `docker compose up -d --build`.

### Opzione B: configurazione manuale

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) modifica config.yaml: domains, server.hostname, admin.token, password DB
# 2) modifica .env: DB_PASSWORD (obbligatoria), WEB_PORT (predefinita 80)
mkdir -p certs
docker compose up -d --build
```

Alla prima visita si apre il **wizard /setup** (l'esempio ha `setup.initialized: false`): inserisci gli stessi valori nel browser.

### Record DNS

```
mail.tuo-dominio.  IN  A    <IP del server>      # hostname di posta
tuo-dominio.       IN  MX  10 mail.tuo-dominio.
```

Chiedi anche al provider VPS di impostare il DNS inverso (PTR) dell'IP del server su `mail.tuo-dominio`.

### Attivare TLS / HTTPS del pannello

1. Pannello admin → Configurazione → Dominio di accesso al pannello: inserisci es. `mail.tuo-dominio` e punta il suo record A al server nel DNS
2. Scheda certificato TLS → inserisci la tua email → **Emetti / rinnova certificato** (il certificato SAN copre l'hostname di posta e il dominio del pannello)
3. Attiva `tls.enabled` — il MX avvia STARTTLS immediatamente (senza riavvio)
4. L'HTTPS del pannello è servito automaticamente sulla porta 443; il rinnovo è completamente automatico

### Controllo degli accessi

Pannello admin → Interruttori → **Consenti l'accesso al pannello utente da IP / altri domini**:

- ATTIVO (predefinito): qualsiasi indirizzo può accedere al pannello utente
- DISATTIVATO: i domini non ufficiali e gli IP vengono reindirizzati al dominio ufficiale del pannello; `/admin`, `/api/*`, `/docs` e il percorso di sfida ACME restano raggiungibili da qualsiasi indirizzo per non restare mai chiusi fuori

### Aggiornamento

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Disinstallazione

```bash
docker compose down -v   # -v elimina anche tutti i dati di posta
```

## Pannello di amministrazione e API

- Token admin: `admin.token` in `config.yaml` (generato da `setup.sh` o dal wizard)
- Riferimento API con test live a un clic: `/api`; Swagger: `/docs`
- Vedi [docs/admin-panel.md](docs/admin-panel.md) e [docs/security.md](docs/security.md)

## Documentazione multilingue

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Guida alla distribuzione](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Pannello di amministrazione](docs/admin-panel.md) · [Sicurezza](docs/security.md)

## Licenza

[MIT](LICENSE) — basato su [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) e [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (entrambi MIT).
