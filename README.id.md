# WGTemporaryEmail

Layanan email sementara sekali pakai yang mengutamakan privasi dan dapat di-hosting sendiri.

**Demo langsung: [https://mail.twcdk.com](https://mail.twcdk.com/)** · Referensi API: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Panel admin: `https://mail.twcdk.com/admin`

WGTemporaryEmail diintegrasikan dari dua proyek sumber terbuka yang luar biasa dan diperluas menjadi produk lengkap yang siap produksi:

| Proyek sumber | Peran | Perluasan di proyek ini |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (FastAPI API + server MX Go + PostgreSQL) | API admin (`/api/v1/admin/*`) dan panel admin, wizard penyiapan awal, muat ulang konfigurasi panas, muat ulang MX panas, batas penyimpanan dengan pembersihan otomatis, perbaikan bug (mis. `max_emails_per_address` dikodekan keras), penguatan keamanan |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Frontend pengguna (Next.js 15) | Terintegrasi ke `web/`, panggilan API asal sama, ekspor statis dilayani nginx, panel admin Mandarin `/admin`, wizard awal `/setup`, sanitasi XSS (DOMPurify), i18n 16 bahasa |

Semua proyek berlisensi MIT dengan pemberitahuan hak cipta asli dipertahankan. Terima kasih kepada [Lm36](https://github.com/Lm36) atas karya luar biasa.

## Fitur

- **Server MX sesuai RFC** - menerima email dari penyedia mana pun di port 25
- **Frontend pengguna** - kotak masuk, lampiran, unduh email asli, lencana DKIM/SPF/DMARC, mode gelap
- **Panel admin** (16 bahasa) - statistik, manajemen email/alamat/domain, pembaruan konfigurasi panas, pembersihan manual
- **Wizard penyiapan awal** - atur domain, hostname, token admin, dan domain panel dari browser
- **Otomasi Let's Encrypt** - penerbitan sekali klik dari panel, pembaruan otomatis; MX dan HTTPS panel berbagi satu sertifikat, pembaruan tidak memerlukan restart MX
- **Kontrol penyimpanan** - batas `max_storage_mb`, email terlama dibersihkan otomatis; termasuk batas email per alamat
- **Kontrol akses** - ikat domain panel dan blokir akses situs pengguna via IP/domain lain; panel admin dan API selalu dapat diakses
- **Keamanan** - pembatasan laju, sanitasi XSS, SQL via ORM, perbandingan token waktu konstan, kontainer non-root, kata sandi DB wajib, tanpa default lemah
- **16 bahasa** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Arsitektur

```
Internet
  │
  ├─ :25  ───────────────► mx     (SMTP Go, memuat ulang config.yaml setiap 15 detik)
  │
  └─ :80 / :443 ────────► web    (nginx: frontend statis + proksi balik)
       ├─ /                  panel pengguna (16 bahasa)
       ├─ /admin             panel admin (16 bahasa)
       ├─ /setup             wizard penyiapan awal
       ├─ /api/* ──────────► api    (FastAPI, hanya jaringan internal)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (untuk sidecar certbot)
            │
            └──► postgres (hanya internal)
```

- `api` dan `postgres` tidak memublikasikan port ke host; semuanya lewat nginx.
- Sidecar `certbot` menerbitkan/memperbarui sertifikat via HTTP-01 webroot; `web` memuat ulang nginx otomatis saat sertifikat atau konfigurasi berubah.

## Penerapan

### Persyaratan

- Domain dengan akses DNS (record MX wajib untuk menerima email)
- VPS dengan IP publik; port **25** dan **80** dapat diakses (443 untuk HTTPS panel)
- Docker + Docker Compose, ~1 GB RAM (tambahkan swap di VPS kecil), beberapa GB disk

### Opsi A: skrip penyiapan interaktif

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

Skrip menanyakan domain penerima, hostname email, port web, CORS, dan opsi TLS, lalu membuat `config.yaml` (dengan token admin acak) dan `.env`, menampilkan record DNS, dan menjalankan `docker compose up -d --build`.

### Opsi B: penyiapan manual

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) edit config.yaml: domains, server.hostname, admin.token, kata sandi DB
# 2) edit .env: DB_PASSWORD (wajib), WEB_PORT (default 80)
mkdir -p certs
docker compose up -d --build
```

Saat kunjungan pertama, **wizard /setup** terbuka (contoh bawaan `setup.initialized: false`); isi nilai yang sama di browser.

### Record DNS

```
mail.domain-anda.  IN  A    <IP server>      # hostname email
domain-anda.       IN  MX  10 mail.domain-anda.
```

Minta juga penyedia VPS untuk mengatur DNS balik (PTR) IP server menjadi `mail.domain-anda`.

### Mengaktifkan TLS / HTTPS panel

1. Panel admin → Pengaturan → Domain akses panel: isi mis. `mail.domain-anda` dan arahkan record A-nya ke server di DNS
2. Kartu sertifikat TLS → isi email Anda → **Terbitkan / perbarui sertifikat** (sertifikat SAN mencakup hostname email dan domain panel)
3. Aktifkan `tls.enabled` — MX langsung memulai STARTTLS (tanpa restart)
4. HTTPS panel otomatis dilayani di port 443; pembaruan sepenuhnya otomatis

### Kontrol akses

Panel admin → Sakelar → **Izinkan akses panel pengguna via IP / domain lain**:

- AKTIF (default): panel dapat diakses dari alamat mana pun
- NONAKTIF: akses dari domain tidak resmi dan IP dialihkan ke domain resmi panel; `/admin`, `/api/*`, `/docs`, dan jalur tantangan ACME tetap dapat diakses dari alamat mana pun agar Anda tidak pernah terkunci

### Pembersihan otomatis log & disk

- Data email: alamat kedaluwarsa dihapus otomatis, total dibatasi `max_storage_mb` (default 1GB) - yang terlama dibersihkan lebih dulu
- Log kontainer: setiap layanan merotasi log 10MB × 3 file (maks 30MB per kontainer)
- Cache build: `docker system prune` + `docker builder prune` mingguan (cron)
- Cache apt: `apt-get autoclean` bulanan (cron)
- journald dibatasi 200MB; semuanya dikonfigurasi otomatis oleh `setup.sh`

### Memperbarui

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d --force-recreate
# apply database migrations (idempotent; only needed when upgrading an existing install)
docker compose exec -T postgres psql -U tempmail -d tempmail < db/migrations/002_permanent_addresses.sql
```

Migrasi ada di `db/migrations/` dan aman dijalankan berulang. Hanya diperlukan saat meningkatkan pemasangan yang lebih lama dari fitur terkait; pemasangan baru mendapat skema lengkap dari `db/init/schema.sql`.

### Menghapus

```bash
docker compose down -v   # -v juga menghapus semua data email
```

## Kotak surat permanen dan API integrasi

Selain alamat sementara yang kedaluwarsa, layanan ini menyediakan **kotak surat permanen**: alamat disimpan selamanya dan emailnya dihapus setelah masa retensi (`tempmail.permanent_email_retention_days`, bawaan 30 hari).

- **Web**: `/mailbox` - pilih nama, simpan token akses, lalu masuk dengan token itu dari perangkat mana pun. Kotak masuknya sama seperti yang sementara (pencarian, penyegaran otomatis, HTML/teks, lampiran, unduh email mentah).
- **API (terautentikasi)**: `POST /api/v1/api/addresses` dengan header `X-API-Key: <kunci integrasi>` dan isi `{"username": "...", "domain": "..."}`.
- **Kunci integrasi**: panel admin -> Konfigurasi -> **Kunci API integrasi** (lihat status / buat ulang; hanya ditampilkan sekali).
- Membuat kotak lewat situs tidak perlu kunci dan dibatasi per IP.

## Cadangan dan pemulihan

- **Basis data** (semua alamat, email, dan lampiran):
  ```bash
  docker exec tempmail_db pg_dump -U tempmail tempmail | gzip > backup-$(date +%F).sql.gz
  docker exec -i tempmail_db psql -U tempmail -d tempmail < backup.sql   # pulihkan
  ```
- **Konfigurasi**: `config.yaml` (token admin, sandi basis data, kunci integrasi) dan `.env`; simpan salinannya, keduanya tidak ada di git.
- **TLS**: `certs/` (`cert.pem`, `key.pem`); bisa diterbitkan ulang dari panel.

## Panel admin dan API

- Token admin: `admin.token` di `config.yaml` (dibuat oleh `setup.sh` atau wizard)
- Referensi API dengan tes langsung sekali klik: `/api`; Swagger: `/docs`
- Lihat [docs/admin-panel.md](docs/admin-panel.md) dan [docs/security.md](docs/security.md)

## Dokumentasi multibahasa

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Panduan penerapan](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Panel admin](docs/admin-panel.md) · [Keamanan](docs/security.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Lisensi

[MIT](LICENSE) — berdasarkan [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) dan [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (keduanya MIT).
