# WGTemporaryEmail

خدمة بريد مؤقت قابلة للاستضافة الذاتية، تضع الخصوصية أولًا.

**الموقع التجريبي: [https://mail.twcdk.com](https://mail.twcdk.com/)** · مرجع API: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · لوحة الإدارة: `https://mail.twcdk.com/admin`

تم بناء WGTemporaryEmail عبر دمج مشروعين ممتازين مفتوحي المصدر وتوسيعهما إلى منتج كامل جاهز للإنتاج:

| المشروع الأصلي | الدور | الإضافات في هذا المشروع |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | الخلفية (FastAPI + خادم MX بلغة Go + PostgreSQL) | واجهة الإدارة (`/api/v1/admin/*`) ولوحة الإدارة، معالج الإعداد الأولي، إعادة تحميل فورية للإعدادات، إعادة تحميل فورية لإعدادات MX، حد أقصى للتخزين مع تنظيف تلقائي، إصلاح أخطاء (مثل `max_emails_per_address` كان مثبتًا)، تقوية أمنية |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | واجهة المستخدم (Next.js 15) | مدمج في `web/`، استدعاءات API من نفس المصدر، تصدير ثابت عبر nginx، لوحة إدارة بالصينية `/admin`، معالج أولي `/setup`، تعقيم XSS (DOMPurify)، دعم 16 لغة |

جميع المشاريع مرخصة بموجب MIT مع الحفاظ على إشعارات حقوق النشر الأصلية. شكرًا لـ [Lm36](https://github.com/Lm36) على العمل الرائع.

## المزايا

- **خادم MX متوافق مع RFC** - يستقبل البريد من أي مزود على المنفذ 25
- **واجهة المستخدم** - صندوق وارد، مرفقات، تنزيل الرسالة الأصلية، شارات DKIM/SPF/DMARC، الوضع الداكن
- **لوحة الإدارة** (16 لغة) - إحصائيات، إدارة الرسائل/العناوين/النطاقات، تحديث فوري للإعدادات، تنظيف يدوي
- **معالج الإعداد الأولي** - اضبط النطاقات واسم المضيف ورمز الإدارة ونطاق اللوحة من المتصفح
- **أتمتة Let's Encrypt** - إصدار بنقرة واحدة من اللوحة، تجديد تلقائي؛ يتشارك MX و HTTPS للوحة شهادة واحدة ولا يتطلب التجديد إعادة تشغيل MX
- **التحكم في التخزين** - حد `max_storage_mb`، تُحذف أقدم الرسائل تلقائيًا؛ مع حد للرسائل لكل عنوان
- **التحكم في الوصول** - اربط نطاق اللوحة وامنع الوصول لموقع المستخدم عبر IP/نطاقات أخرى؛ تبقى لوحة الإدارة و API متاحتين دائمًا
- **الأمان** - تحديد المعدل، تعقيم XSS، SQL عبر ORM، مقارنة الرموز بزمن ثابت، حاويات غير root، كلمة مرور قاعدة البيانات إلزامية، بلا قيم افتراضية ضعيفة
- **16 لغة** - English، 简体中文، 繁體中文، 日本語، 한국어، Español، Français، Deutsch، Português، Русский، العربية (RTL)، हिन्दी، Italiano، Türkçe، Bahasa Indonesia، Tiếng Việt

## البنية

```
الإنترنت
  │
  ├─ :25  ───────────────► mx     (SMTP بلغة Go، يعيد تحميل config.yaml كل 15 ثانية)
  │
  └─ :80 / :443 ────────► web    (nginx: واجهة ثابتة + وكيل عكسي)
       ├─ /                  لوحة المستخدم (16 لغة)
       ├─ /admin             لوحة الإدارة (16 لغة)
       ├─ /setup             معالج الإعداد الأولي
       ├─ /api/* ──────────► api    (FastAPI، شبكة داخلية فقط)
       ├─ /docs و /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (لحاوية certbot الجانبية)
            │
            └──► postgres (داخلي فقط)
```

- لا ينشر `api` و `postgres` أي منافذ على المضيف؛ كل شيء يمر عبر nginx.
- تصدر حاوية `certbot` الجانبية الشهادات وتجددها عبر HTTP-01 webroot؛ ويعيد `web` تحميل nginx تلقائيًا عند تغير الشهادة أو الإعدادات.

## النشر

### المتطلبات

- نطاق مع صلاحية إدارة DNS (سجل MX إلزامي لاستقبال البريد)
- خادم VPS بعنوان IP عام؛ المنفذان **25** و **80** متاحان (443 لـ HTTPS اللوحة)
- Docker + Docker Compose، نحو 1 جيجابايت ذاكرة (أضف swap على الخوادم الصغيرة)، عدة جيجابايت قرص

### الخيار أ: سكربت التثبيت التفاعلي

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

يسأل السكربت عن نطاقات الاستقبال واسم مضيف البريد ومنفذ الويب و CORS وخيارات TLS، ثم يولّد `config.yaml` (مع رمز إدارة عشوائي) و `.env` ويعرض سجلات DNS وينفّذ `docker compose up -d --build`.

### الخيار ب: الإعداد اليدوي

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) عدّل config.yaml: domains و server.hostname و admin.token وكلمة مرور قاعدة البيانات
# 2) عدّل .env: DB_PASSWORD (إلزامي) و WEB_PORT (80 افتراضيًا)
mkdir -p certs
docker compose up -d --build
```

عند الزيارة الأولى يفتح **معالج /setup** (المثال يأتي بـ `setup.initialized: false`)؛ املأ القيم نفسها في المتصفح.

### سجلات DNS

```
mail.نطاقك.  IN  A    <عنوان IP الخادم>      # اسم مضيف البريد
نطاقك.       IN  MX  10 mail.نطاقك.
```

اطلب أيضًا من مزود VPS ضبط DNS العكسي (PTR) لعنوان IP الخادم إلى `mail.نطاقك`.

### تفعيل TLS / HTTPS اللوحة

1. لوحة الإدارة ← الإعدادات ← نطاق الوصول للوحة: أدخل مثلًا `mail.نطاقك` ووجّه سجل A الخاص به إلى الخادم في DNS
2. بطاقة شهادة TLS ← أدخل بريدك ← **إصدار / تجديد الشهادة** (تغطي شهادة SAN اسم مضيف البريد ونطاق اللوحة معًا)
3. فعّل `tls.enabled` — يبدأ MX تشفير STARTTLS فورًا (دون إعادة تشغيل)
4. يُقدَّم HTTPS اللوحة تلقائيًا على المنفذ 443؛ والتجديد تلقائي بالكامل

### التحكم في الوصول

لوحة الإدارة ← مفاتيح ← **السماح بالوصول إلى لوحة المستخدم عبر IP / نطاقات أخرى**:

- مفعّل (افتراضي): يمكن الوصول للوحة من أي عنوان
- معطّل: يُعاد توجيه الوصول عبر النطاقات غير الرسمية أو IP إلى النطاق الرسمي للوحة؛ تبقى `/admin` و `/api/*` و `/docs` ومسار تحدي ACME متاحة من أي عنوان حتى لا تُقفل خارجًا أبدًا

### التحديث

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### إلغاء التثبيت

```bash
docker compose down -v   # -v يحذف أيضًا كل بيانات البريد
```

## لوحة الإدارة و API

- رمز الإدارة: `admin.token` في `config.yaml` (يولده `setup.sh` أو المعالج)
- مرجع API مع اختبارات مباشرة بنقرة واحدة: `/api`؛ Swagger: `/docs`
- راجع [docs/admin-panel.md](docs/admin-panel.md) و [docs/security.md](docs/security.md)

## توثيق متعدد اللغات

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [دليل النشر](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [لوحة الإدارة](docs/admin-panel.md) · [الأمان](docs/security.md)

## الترخيص

[MIT](LICENSE) — مبني على [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) و [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (كلاهما MIT).
