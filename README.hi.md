# WGTemporaryEmail

गोपनीयता-प्रथम, स्व-होस्टेड डिस्पोज़ेबल अस्थायी ईमेल सेवा।

**लाइव डेमो: [https://mail.twcdk.com](https://mail.twcdk.com/)** · API संदर्भ: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · प्रबंधन पैनल: `https://mail.twcdk.com/admin`

WGTemporaryEmail दो उत्कृष्ट ओपन सोर्स परियोजनाओं से एकीकृत करके एक संपूर्ण, उत्पादन-तैयार उत्पाद के रूप में विस्तारित किया गया है:

| मूल परियोजना | भूमिका | इस परियोजना में विस्तार |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | बैकएंड (FastAPI API + Go MX सर्वर + PostgreSQL) | प्रबंधन API (`/api/v1/admin/*`) व प्रबंधन पैनल, प्रथम सेटअप विज़ार्ड, कॉन्फ़िग हॉट-रीलोड, MX हॉट-रीलोड, स्वतः सफ़ाई के साथ संग्रहण सीमा, बग सुधार (जैसे `max_emails_per_address` हार्डकोड था), सुरक्षा सुदृढ़ीकरण |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | उपयोगकर्ता फ्रंटएंड (Next.js 15) | `web/` में एकीकरण, समान-मूल API कॉल, nginx द्वारा स्थैतिक होस्टिंग, चीनी प्रबंधन पैनल `/admin`, प्रथम विज़ार्ड `/setup`, XSS सैनिटाइज़ेशन (DOMPurify), 16 भाषाओं में i18n |

सभी परियोजनाएँ MIT लाइसेंस के अंतर्गत हैं; मूल कॉपीराइट सूचनाएँ सुरक्षित हैं। बेहतरीन काम के लिए [Lm36](https://github.com/Lm36) को धन्यवाद।

## विशेषताएँ

- **RFC-अनुरूप MX सर्वर** - पोर्ट 25 पर किसी भी प्रदाता से मेल प्राप्त करता है
- **उपयोगकर्ता फ्रंटएंड** - इनबॉक्स, अनुलग्नक, मूल मेल डाउनलोड, DKIM/SPF/DMARC बैज, डार्क मोड
- **प्रबंधन पैनल** (16 भाषाएँ) - आँकड़े, मेल/पता/डोमेन प्रबंधन, हॉट कॉन्फ़िग अपडेट, मैन्युअल सफ़ाई
- **प्रथम सेटअप विज़ार्ड** - ब्राउज़र से ही डोमेन, होस्टनाम, प्रबंधन टोकन और पैनल डोमेन सेट करें
- **Let's Encrypt स्वचालन** - पैनल से एक-क्लिक जारी, स्वतः नवीनीकरण; MX और पैनल HTTPS एक ही प्रमाणपत्र साझा करते हैं, नवीनीकरण के लिए MX पुनः आरंभ की आवश्यकता नहीं
- **संग्रहण नियंत्रण** - `max_storage_mb` सीमा, सबसे पुराने मेल स्वतः हटते हैं; प्रति पता मेल सीमा भी
- **पहुँच नियंत्रण** - पैनल डोमेन बाँधकर IP/अन्य डोमेन से उपयोगकर्ता साइट की पहुँच रोकें; प्रबंधन पैनल व API सदा पहुँच योग्य
- **सुरक्षा** - दर सीमा, XSS सैनिटाइज़ेशन, ORM से SQL, टोकन की स्थिर-समय तुलना, बिना-root कंटेनर, DB पासवर्ड अनिवार्य, कोई कमज़ोर डिफ़ॉल्ट नहीं
- **16 भाषाएँ** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## आर्किटेक्चर

```
इंटरनेट
  │
  ├─ :25  ───────────────► mx     (Go SMTP, हर 15 सेकंड में config.yaml हॉट-रीलोड)
  │
  └─ :80 / :443 ────────► web    (nginx: स्थैतिक फ्रंटएंड + रिवर्स प्रॉक्सी)
       ├─ /                  उपयोगकर्ता पैनल (16 भाषाएँ)
       ├─ /admin             प्रबंधन पैनल (16 भाषाएँ)
       ├─ /setup             प्रथम सेटअप विज़ार्ड
       ├─ /api/* ──────────► api    (FastAPI, केवल आंतरिक नेटवर्क)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (certbot साइडकार हेतु)
            │
            └──► postgres (केवल आंतरिक)
```

- `api` व `postgres` होस्ट पर पोर्ट प्रकाशित नहीं करते; सब कुछ nginx से होकर जाता है।
- `certbot` साइडकार HTTP-01 webroot से प्रमाणपत्र जारी/नवीनीकृत करता है; प्रमाणपत्र या कॉन्फ़िग बदलने पर `web` nginx को स्वतः रीलोड करता है।

## परिनियोजन

### आवश्यकताएँ

- DNS प्रबंधन वाला डोमेन (मेल प्राप्ति हेतु MX रिकॉर्ड अनिवार्य)
- पब्लिक IP वाला VPS; पोर्ट **25** व **80** पहुँच योग्य (पैनल HTTPS हेतु 443)
- Docker + Docker Compose, लगभग 1 GB RAM (छोटे VPS पर swap जोड़ें), कुछ GB डिस्क

### विकल्प A: इंटरैक्टिव सेटअप स्क्रिप्ट

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

स्क्रिप्ट प्राप्ति डोमेन, मेल होस्टनाम, वेब पोर्ट, CORS व TLS विकल्प पूछती है, `config.yaml` (यादृच्छिक प्रबंधन टोकन सहित) व `.env` बनाती है, DNS रिकॉर्ड दिखाती है और `docker compose up -d --build` चलाती है।

### विकल्प B: मैन्युअल सेटअप

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) config.yaml संपादित करें: domains, server.hostname, admin.token, DB पासवर्ड
# 2) .env संपादित करें: DB_PASSWORD (अनिवार्य), WEB_PORT (डिफ़ॉल्ट 80)
mkdir -p certs
docker compose up -d --build
```

पहली बार खोलने पर **/setup विज़ार्ड** खुलता है (उदाहरण में `setup.initialized: false`) — वही मान ब्राउज़र में भरें।

### DNS रिकॉर्ड

```
mail.आपका-डोमेन.  IN  A    <सर्वर IP>      # मेल होस्टनाम
आपका-डोमेन.       IN  MX  10 mail.आपका-डोमेन.
```

साथ ही VPS प्रदाता से सर्वर IP का रिवर्स DNS (PTR) `mail.आपका-डोमेन` सेट कराने का अनुरोध करें।

### TLS / पैनल HTTPS सक्षम करें

1. प्रबंधन पैनल → सिस्टम सेटिंग्स → पैनल एक्सेस डोमेन: जैसे `mail.आपका-डोमेन` भरें और DNS में उसका A रिकॉर्ड सर्वर की ओर करें
2. TLS प्रमाणपत्र कार्ड → ईमेल भरें → **प्रमाणपत्र जारी / नवीनीकृत करें** (SAN प्रमाणपत्र मेल होस्टनाम व पैनल डोमेन दोनों को कवर करता है)
3. `tls.enabled` चालू करें — MX तुरंत STARTTLS शुरू करता है (बिना पुनः आरंभ)
4. पैनल HTTPS 443 पर स्वतः मिलता है; नवीनीकरण पूर्णतः स्वचालित

### पहुँच नियंत्रण

प्रबंधन पैनल → सुविधा स्विच → **IP / अन्य डोमेन से उपयोगकर्ता पैनल पहुँच की अनुमति दें**:

- चालू (डिफ़ॉल्ट): किसी भी पते से पैनल खुलता है
- बंद: गैर-आधिकारिक डोमेन व IP से पहुँच आधिकारिक पैनल डोमेन पर रीडायरेक्ट होती है; `/admin`, `/api/*`, `/docs` व ACME चैलेंज पथ किसी भी पते से उपलब्ध रहते हैं ताकि आप कभी बाहर लॉक न हों

### अपडेट

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### अनइंस्टॉल

```bash
docker compose down -v   # -v सभी मेल डेटा भी हटा देता है
```

## प्रबंधन पैनल व API

- प्रबंधन टोकन: `config.yaml` में `admin.token` (`setup.sh` या विज़ार्ड द्वारा जनरेट)
- एक-क्लिक लाइव टेस्ट वाला API संदर्भ: `/api`; Swagger: `/docs`
- [docs/admin-panel.md](docs/admin-panel.md) व [docs/security.md](docs/security.md) देखें

## बहुभाषी दस्तावेज़

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [परिनियोजन गाइड](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [प्रबंधन पैनल](docs/admin-panel.md) · [सुरक्षा](docs/security.md)

## लाइसेंस

[MIT](LICENSE) — [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) व [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (दोनों MIT) पर आधारित।
