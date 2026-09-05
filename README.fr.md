# WGTemporaryEmail

Un service d'e-mail temporaire jetable, auto-hébergé et centré sur la confidentialité.

**Démo en ligne : [https://mail.twcdk.com](https://mail.twcdk.com/)** · Référence API : [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Panneau d'administration : `https://mail.twcdk.com/admin`

WGTemporaryEmail est intégré à partir de deux excellents projets open source et étendu en un produit complet, prêt pour la production :

| Projet d'origine | Rôle | Extensions apportées |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (API FastAPI + serveur MX en Go + PostgreSQL) | API d'administration (`/api/v1/admin/*`) et panneau admin, assistant de première configuration, rechargement à chaud de la configuration, rechargement à chaud du MX, limite de stockage avec nettoyage automatique, corrections de bugs (ex. `max_emails_per_address` était codé en dur), durcissement de la sécurité |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Frontend utilisateur (Next.js 15) | Intégré dans `web/`, appels API même origine, export statique servi par nginx, panneau admin en chinois `/admin`, assistant initial `/setup`, assainissement XSS (DOMPurify), i18n en 16 langues |

Tous les projets sont sous licence MIT, avec les mentions de copyright d'origine préservées. Merci à [Lm36](https://github.com/Lm36) pour l'excellent travail.

## Fonctionnalités

- **Serveur MX conforme RFC** - reçoit le courrier de n'importe quel fournisseur sur le port 25
- **Frontend utilisateur** - boîte de réception, pièces jointes, téléchargement du courrier brut, badges DKIM/SPF/DMARC, mode sombre
- **Panneau d'administration** (16 langues) - statistiques, gestion des e-mails/adresses/domaines, mise à jour à chaud de la configuration, nettoyage manuel
- **Assistant de première configuration** - configurez domaines, nom d'hôte, jeton admin et domaine du panneau depuis le navigateur
- **Automatisation Let's Encrypt** - émission en un clic depuis le panneau, renouvellement automatique ; le MX et le HTTPS du panneau partagent un certificat et les renouvellements ne nécessitent pas de redémarrage du MX
- **Contrôle du stockage** - plafond `max_storage_mb`, les e-mails les plus anciens sont nettoyés automatiquement ; limite d'e-mails par adresse incluse
- **Contrôle d'accès** - liez un domaine de panneau et bloquez l'accès au site utilisateur par IP/autres domaines ; le panneau admin et l'API restent toujours joignables
- **Sécurité** - limitation de débit, assainissement XSS, SQL via ORM, comparaison de jetons en temps constant, conteneurs non root, mot de passe BD obligatoire, aucune valeur par défaut faible
- **16 langues** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Architecture

```
Internet
  │
  ├─ :25  ───────────────► mx     (SMTP en Go, recharge config.yaml toutes les 15 s)
  │
  └─ :80 / :443 ────────► web    (nginx : frontend statique + reverse proxy)
       ├─ /                  panneau utilisateur (16 langues)
       ├─ /admin             panneau d'administration (16 langues)
       ├─ /setup             assistant initial
       ├─ /api/* ──────────► api    (FastAPI, réseau interne uniquement)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (pour le sidecar certbot)
            │
            └──► postgres (interne uniquement)
```

- `api` et `postgres` ne publient aucun port sur l'hôte ; tout passe par nginx.
- Le sidecar `certbot` émet et renouvelle les certificats via HTTP-01 webroot ; `web` recharge nginx automatiquement lors des changements de certificat ou de configuration.

## Déploiement

### Prérequis

- Un domaine avec accès à son DNS (l'enregistrement MX est obligatoire pour recevoir du courrier)
- Un VPS avec IP publique ; ports **25** et **80** accessibles (443 pour le HTTPS du panneau)
- Docker + Docker Compose, ~1 Go de RAM (ajoutez du swap sur les petits VPS), quelques Go de disque

### Option A : script d'installation interactif

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

Le script demande vos domaines de réception, le nom d'hôte du courrier, le port web, CORS et les options TLS, génère `config.yaml` (avec un jeton admin aléatoire) et `.env`, affiche les enregistrements DNS puis exécute `docker compose up -d --build`.

### Option B : configuration manuelle

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) éditez config.yaml : domains, server.hostname, admin.token, mot de passe BD
# 2) éditez .env : DB_PASSWORD (obligatoire), WEB_PORT (80 par défaut)
mkdir -p certs
docker compose up -d --build
```

À la première visite, l'**assistant /setup** s'ouvre (l'exemple a `setup.initialized: false`) : remplissez les mêmes valeurs dans le navigateur.

### Enregistrements DNS

```
mail.votre-domaine.  IN  A    <IP du serveur>      # nom d'hôte du courrier
votre-domaine.       IN  MX  10 mail.votre-domaine.
```

Demandez aussi à votre hébergeur VPS de configurer le DNS inverse (PTR) de l'IP du serveur vers `mail.votre-domaine`.

### Activer TLS / HTTPS du panneau

1. Panneau admin → Configuration → Domaine d'accès au panneau : saisissez p. ex. `mail.votre-domaine` et pointez son enregistrement A vers le serveur dans le DNS
2. Carte certificat TLS → saisissez votre e-mail → **Émettre / renouveler le certificat** (le certificat SAN couvre le nom d'hôte du courrier et le domaine du panneau)
3. Activez `tls.enabled` : le MX démarre STARTTLS immédiatement (sans redémarrage)
4. Le HTTPS du panneau est servi automatiquement sur 443 ; le renouvellement est entièrement automatique

### Contrôle d'accès

Panneau admin → Interrupteurs → **Autoriser l'accès au panneau utilisateur par IP / autres domaines** :

- ACTIVÉ (défaut) : n'importe quelle adresse peut accéder au panneau utilisateur
- DÉSACTIVÉ : les domaines non officiels et les IP sont redirigés vers le domaine officiel du panneau ; `/admin`, `/api/*`, `/docs` et le chemin de défi ACME restent accessibles depuis n'importe quelle adresse afin de ne jamais vous enfermer dehors

### Mise à jour

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Désinstallation

```bash
docker compose down -v   # -v supprime aussi toutes les données de courrier
```

## Panneau d'administration et API

- Jeton admin : `admin.token` dans `config.yaml` (généré par `setup.sh` ou l'assistant)
- Référence API avec tests en direct en un clic : `/api` ; Swagger : `/docs`
- Voir [docs/admin-panel.md](docs/admin-panel.md) et [docs/security.md](docs/security.md)

## Documentation multilingue

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Guide de déploiement](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Panneau d'administration](docs/admin-panel.md) · [Sécurité](docs/security.md)

## Licence

[MIT](LICENSE) — basé sur [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) et [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (tous deux MIT).
