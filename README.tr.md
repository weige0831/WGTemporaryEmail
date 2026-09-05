# WGTemporaryEmail

Gizlilik öncelikli, kendi sunucunuzda barındırılabilen tek kullanımlık geçici e-posta hizmeti.

**Canlı demo: [https://mail.twcdk.com](https://mail.twcdk.com/)** · API başvurusu: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Yönetim paneli: `https://mail.twcdk.com/admin`

WGTemporaryEmail, iki mükemmel açık kaynak projeden entegre edilerek tam ve üretime hazır bir ürüne genişletilmiştir:

| Kaynak proje | Rol | Bu projedeki genişletmeler |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Arka uç (FastAPI API + Go MX sunucusu + PostgreSQL) | Yönetim API'si (`/api/v1/admin/*`) ve yönetim paneli, ilk kurulum sihirbazı, yapılandırma sıcak yenileme, MX sıcak yenileme, otomatik temizlemeli depolama sınırı, hata düzeltmeleri (örn. `max_emails_per_address` sabitti), güvenlik sıkılaştırma |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Kullanıcı arayüzü (Next.js 15) | `web/`'e entegre, aynı kaynaklı API çağrıları, nginx ile statik barındırma, Çince yönetim paneli `/admin`, ilk kurulum sihirbazı `/setup`, XSS temizliği (DOMPurify), 16 dilde i18n |

Tüm projeler MIT lisanslıdır; orijinal telif bildirimleri korunur. Harika çalışmaları için [Lm36](https://github.com/Lm36)'ya teşekkürler.

## Özellikler

- **RFC uyumlu MX sunucusu** - 25 numaralı bağlantı noktasından her sağlayıcıdan posta alır
- **Kullanıcı arayüzü** - gelen kutusu, ekler, orijinal posta indirme, DKIM/SPF/DMARC rozetleri, karanlık mod
- **Yönetim paneli** (16 dil) - istatistikler, e-posta/adres/alan adı yönetimi, sıcak yapılandırma güncellemesi, manuel temizlik
- **İlk kurulum sihirbazı** - alan adları, ana makine adı, yönetici anahtarı ve panel alan adını tarayıcıdan yapılandırın
- **Let's Encrypt otomasyonu** - panelden tek tıkla verme, otomatik yenileme; MX ile panel HTTPS'i tek sertifikayı paylaşır, yenilemeler MX'i yeniden başlatmayı gerektirmez
- **Depolama kontrolü** - `max_storage_mb` sınırı, en eski e-postalar otomatik silinir; adres başına e-posta sınırı dahil
- **Erişim kontrolü** - panel alan adı bağlayıp kullanıcı sitesine IP/diğer alan adlarından erişimi engelleyin; yönetim paneli ve API her zaman erişilebilir kalır
- **Güvenlik** - hız sınırlama, XSS temizliği, ORM üzerinden SQL, sabit zamanlı belirteç karşılaştırma, root olmayan konteynerler, zorunlu veritabanı parolası, zayıf varsayılan yok
- **16 dil** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Mimari

```
İnternet
  │
  ├─ :25  ───────────────► mx     (Go SMTP, config.yaml'i 15 saniyede bir sıcak yeniler)
  │
  └─ :80 / :443 ────────► web    (nginx: statik arayüz + ters proxy)
       ├─ /                  kullanıcı paneli (16 dil)
       ├─ /admin             yönetim paneli (16 dil)
       ├─ /setup             ilk kurulum sihirbazı
       ├─ /api/* ──────────► api    (FastAPI, yalnızca iç ağ)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (certbot yan konteyneri için)
            │
            └──► postgres (yalnızca iç)
```

- `api` ve `postgres` ana makineye bağlantı noktası yayınlamaz; her şey nginx üzerinden gider.
- `certbot` yan konteyneri sertifikaları HTTP-01 webroot ile verir/yeniler; sertifika veya yapılandırma değişince `web` nginx'i otomatik yeniden yükler.

## Kurulum

### Gereksinimler

- DNS erişimi olan bir alan adı (posta almak için MX kaydı zorunludur)
- Genel IP'li bir VPS; **25** ve **80** bağlantı noktaları erişilebilir (panel HTTPS'i için 443)
- Docker + Docker Compose, ~1 GB RAM (küçük VPS'lerde swap ekleyin), birkaç GB disk

### Seçenek A: etkileşimli kurulum betiği

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

Betik alım alan adlarını, posta ana makine adını, web bağlantı noktasını, CORS ve TLS seçeneklerini sorar; `config.yaml` (rastgele yönetici anahtarıyla) ve `.env` oluşturur, DNS kayıtlarını gösterir ve `docker compose up -d --build` çalıştırır.

### Seçenek B: elle yapılandırma

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) config.yaml'i düzenleyin: domains, server.hostname, admin.token, DB parolası
# 2) .env'i düzenleyin: DB_PASSWORD (zorunlu), WEB_PORT (varsayılan 80)
mkdir -p certs
docker compose up -d --build
```

İlk ziyarette **/setup sihirbazı** açılır (örnekte `setup.initialized: false`); aynı değerleri tarayıcıda doldurun.

### DNS kayıtları

```
mail.alan-adınız.  IN  A    <sunucu IP'si>      # posta ana makine adı
alan-adınız.       IN  MX  10 mail.alan-adınız.
```

Ayrıca VPS sağlayıcınızdan sunucu IP'sinin ters DNS (PTR) kaydını `mail.alan-adınız` olarak ayarlamasını isteyin.

### TLS / panel HTTPS'i etkinleştirme

1. Yönetim paneli → Sistem Ayarları → Panel erişim alan adı: örn. `mail.alan-adınız` girin ve DNS'te A kaydını sunucuya yönlendirin
2. TLS sertifika kartı → e-postanızı girin → **Sertifika ver / yenile** (SAN sertifikası hem posta ana makine adını hem panel alan adını kapsar)
3. `tls.enabled` anahtarını açın — MX, STARTTLS'i hemen başlatır (yeniden başlatma gerekmez)
4. Panel HTTPS'i 443 numaralı bağlantı noktasında otomatik sunulur; yenileme tamamen otomatiktir

### Erişim kontrolü

Yönetim paneli → Özellik Anahtarları → **Kullanıcı paneline IP / diğer alan adlarıyla erişime izin ver**:

- AÇIK (varsayılan): kullanıcı paneline her adresten erişilebilir
- KAPALI: resmî olmayan alan adları ve IP'lerden erişim resmî panel alan adına yönlendirilir; `/admin`, `/api/*`, `/docs` ve ACME doğrulama yolu her adresten erişilebilir kalır, böylece asla dışarıda kilitli kalmazsınız

### Güncelleme

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Kaldırma

```bash
docker compose down -v   # -v tüm posta verilerini de siler
```

## Yönetim paneli ve API

- Yönetici anahtarı: `config.yaml` içindeki `admin.token` (`setup.sh` veya sihirbaz tarafından üretilir)
- Tek tıkla canlı testli API başvurusu: `/api`; Swagger: `/docs`
- [docs/admin-panel.md](docs/admin-panel.md) ve [docs/security.md](docs/security.md) dosyalarına bakın

## Çok dilli belgeler

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Kurulum kılavuzu](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Yönetim paneli](docs/admin-panel.md) · [Güvenlik](docs/security.md)

## Lisans

[MIT](LICENSE) — [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) ve [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (her ikisi de MIT) tabanlıdır.
