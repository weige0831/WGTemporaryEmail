# WGTemporaryEmail

Un servicio de correo temporal desechable, autohospedado y centrado en la privacidad.

**Demo en vivo: [https://mail.twcdk.com](https://mail.twcdk.com/)** · Referencia API: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Panel de administración: `https://mail.twcdk.com/admin`

WGTemporaryEmail está integrado a partir de dos excelentes proyectos de código abierto y ampliado hasta formar un producto completo y listo para producción:

| Proyecto de origen | Rol | Extensiones en este proyecto |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (API FastAPI + servidor MX en Go + PostgreSQL) | API de administración (`/api/v1/admin/*`) y panel admin, asistente de configuración inicial, recarga en caliente de la configuración, recarga en caliente del MX, límite de almacenamiento con limpieza automática, corrección de errores (p. ej. `max_emails_per_address` estaba fijo), refuerzo de seguridad |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Frontend de usuario (Next.js 15) | Integrado en `web/`, llamadas API del mismo origen, exportación estática servida por nginx, panel admin en chino `/admin`, asistente inicial `/setup`, saneamiento XSS (DOMPurify), i18n de 16 idiomas |

Todos los proyectos usan la licencia MIT y conservan los avisos de copyright originales. Gracias a [Lm36](https://github.com/Lm36) por el gran trabajo.

## Características

- **Servidor MX conforme a RFC** - recibe correo de cualquier proveedor en el puerto 25
- **Frontend de usuario** - bandeja de entrada, adjuntos, descarga del correo original, insignias DKIM/SPF/DMARC, modo oscuro
- **Panel de administración** (16 idiomas) - estadísticas, gestión de correos/direcciones/dominios, actualización de configuración en caliente, limpieza manual
- **Asistente de configuración inicial** - configura dominios, hostname, token de admin y dominio del panel desde el navegador
- **Automatización Let's Encrypt** - emisión con un clic desde el panel, renovación automática; el MX y el HTTPS del panel comparten un certificado y las renovaciones no requieren reiniciar el MX
- **Control de almacenamiento** - límite `max_storage_mb`, los correos más antiguos se limpian automáticamente; también hay límite de correos por dirección
- **Control de acceso** - vincula un dominio del panel y bloquea el acceso al sitio de usuario por IP/otros dominios; el panel admin y la API siempre quedan accesibles
- **Seguridad** - limitación de velocidad, saneamiento XSS, SQL mediante ORM, comparación de tokens en tiempo constante, contenedores sin root, contraseña de BD obligatoria, sin valores por defecto débiles
- **16 idiomas** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Arquitectura

```
Internet
  │
  ├─ :25  ───────────────► mx     (SMTP en Go, recarga config.yaml cada 15 s)
  │
  └─ :80 / :443 ────────► web    (nginx: frontend estático + proxy inverso)
       ├─ /                  panel de usuario (16 idiomas)
       ├─ /admin             panel de administración (16 idiomas)
       ├─ /setup             asistente inicial
       ├─ /api/* ──────────► api    (FastAPI, solo red interna)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (para el sidecar certbot)
            │
            └──► postgres (solo interno)
```

- `api` y `postgres` no publican puertos en el host; todo pasa por nginx.
- El sidecar `certbot` emite y renueva certificados mediante HTTP-01 webroot; `web` recarga nginx automáticamente ante cambios de certificado o configuración.

## Despliegue

### Requisitos

- Un dominio con acceso a su DNS (el registro MX es obligatorio para recibir correo)
- Un VPS con IP pública; puertos **25** y **80** accesibles (443 para HTTPS del panel)
- Docker + Docker Compose, ~1 GB de RAM (añade swap en VPS pequeños), varios GB de disco

### Opción A: script de instalación interactivo

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

El script pregunta por tus dominios de recepción, hostname de correo, puerto web, CORS y opciones TLS; genera `config.yaml` (con token de admin aleatorio) y `.env`, imprime los registros DNS y ejecuta `docker compose up -d --build`.

### Opción B: configuración manual

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) edita config.yaml: domains, server.hostname, admin.token, contraseña de BD
# 2) edita .env: DB_PASSWORD (obligatorio), WEB_PORT (por defecto 80)
mkdir -p certs
docker compose up -d --build
```

En la primera visita se abre el **asistente /setup** (el ejemplo trae `setup.initialized: false`), donde rellenas los mismos valores en el navegador.

### Registros DNS

```
mail.tu-dominio.  IN  A    <IP del servidor>      # hostname de correo
tu-dominio.       IN  MX  10 mail.tu-dominio.
```

Pide también a tu proveedor de VPS que configure el DNS inverso (PTR) de la IP del servidor como `mail.tu-dominio`.

### Activar TLS / HTTPS del panel

1. Panel admin → Configuración → Dominio de acceso al panel: rellena p. ej. `mail.tu-dominio` y apunta su registro A al servidor en el DNS
2. Tarjeta de certificado TLS → introduce tu email → **Emitir / renovar certificado** (el certificado SAN cubre el hostname de correo y el dominio del panel)
3. Activa `tls.enabled`: el MX inicia STARTTLS al instante (sin reiniciar)
4. El HTTPS del panel se sirve automáticamente en 443; la renovación es totalmente automática

### Control de acceso

Panel admin → Interruptores → **Permitir acceso al panel de usuario por IP / otros dominios**:

- ACTIVADO (por defecto): cualquier dirección puede acceder al panel de usuario
- DESACTIVADO: los dominios no oficiales y las IP se redirigen al dominio oficial del panel; `/admin`, `/api/*`, `/docs` y la ruta de desafío ACME siguen accesibles desde cualquier dirección para que nunca te quedes fuera

### Actualizar

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Desinstalar

```bash
docker compose down -v   # -v también borra todos los datos de correo
```

## Panel de administración y API

- Token de admin: `admin.token` en `config.yaml` (generado por `setup.sh` o el asistente)
- Referencia API con pruebas en vivo de un clic: `/api`; Swagger: `/docs`
- Consulta [docs/admin-panel.md](docs/admin-panel.md) y [docs/security.md](docs/security.md)

## Documentación multilingüe

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Guía de despliegue](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Panel de administración](docs/admin-panel.md) · [Seguridad](docs/security.md)

## Licencia

[MIT](LICENSE) — basado en [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) y [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (ambos MIT).
