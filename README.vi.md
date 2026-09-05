# WGTemporaryEmail

Dịch vụ email tạm thời dùng một lần, tự lưu trữ và ưu tiên quyền riêng tư.

**Demo trực tiếp: [https://mail.twcdk.com](https://mail.twcdk.com/)** · Tham chiếu API: [https://mail.twcdk.com/api](https://mail.twcdk.com/api) · Bảng quản trị: `https://mail.twcdk.com/admin`

WGTemporaryEmail được tích hợp từ hai dự án mã nguồn mở xuất sắc và mở rộng thành một sản phẩm hoàn chỉnh, sẵn sàng cho sản xuất:

| Dự án gốc | Vai trò | Mở rộng trong dự án này |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | Backend (FastAPI API + máy chủ MX Go + PostgreSQL) | API quản trị (`/api/v1/admin/*`) và bảng quản trị, trình hướng dẫn thiết lập lần đầu, tải lại cấu hình nóng, tải lại MX nóng, giới hạn dung lượng với dọn dẹp tự động, sửa lỗi (ví dụ `max_emails_per_address` bị mã cứng), tăng cường bảo mật |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | Frontend người dùng (Next.js 15) | Tích hợp vào `web/`, gọi API cùng nguồn gốc, xuất tĩnh qua nginx, bảng quản trị tiếng Trung `/admin`, trình hướng dẫn đầu tiên `/setup`, làm sạch XSS (DOMPurify), i18n 16 ngôn ngữ |

Tất cả các dự án đều theo giấy phép MIT, giữ nguyên thông báo bản quyền gốc. Cảm ơn [Lm36](https://github.com/Lm36) vì công việc tuyệt vời.

## Tính năng

- **Máy chủ MX chuẩn RFC** - nhận thư từ mọi nhà cung cấp trên cổng 25
- **Frontend người dùng** - hộp thư đến, tệp đính kèm, tải thư gốc, huy hiệu DKIM/SPF/DMARC, chế độ tối
- **Bảng quản trị** (16 ngôn ngữ) - thống kê, quản lý thư/địa chỉ/tên miền, cập nhật cấu hình nóng, dọn dẹp thủ công
- **Trình hướng dẫn thiết lập lần đầu** - cấu hình tên miền, hostname, token quản trị và tên miền bảng ngay trên trình duyệt
- **Tự động hóa Let's Encrypt** - cấp một chạm từ bảng, gia hạn tự động; MX và HTTPS bảng dùng chung một chứng chỉ, gia hạn không cần khởi động lại MX
- **Kiểm soát dung lượng** - giới hạn `max_storage_mb`, thư cũ nhất tự bị xóa; kèm giới hạn thư trên mỗi địa chỉ
- **Kiểm soát truy cập** - ràng buộc tên miền bảng và chặn truy cập trang người dùng qua IP/tên miền khác; bảng quản trị và API luôn truy cập được
- **Bảo mật** - giới hạn tốc độ, làm sạch XSS, SQL qua ORM, so sánh token thời gian hằng, container không root, mật khẩu DB bắt buộc, không có mặc định yếu
- **16 ngôn ngữ** - English, 简体中文, 繁體中文, 日本語, 한국어, Español, Français, Deutsch, Português, Русский, العربية (RTL), हिन्दी, Italiano, Türkçe, Bahasa Indonesia, Tiếng Việt

## Kiến trúc

```
Internet
  │
  ├─ :25  ───────────────► mx     (SMTP Go, tải lại config.yaml mỗi 15 giây)
  │
  └─ :80 / :443 ────────► web    (nginx: frontend tĩnh + proxy ngược)
       ├─ /                  bảng người dùng (16 ngôn ngữ)
       ├─ /admin             bảng quản trị (16 ngôn ngữ)
       ├─ /setup             trình hướng dẫn lần đầu
       ├─ /api/* ──────────► api    (FastAPI, chỉ mạng nội bộ)
       ├─ /docs, /openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (cho sidecar certbot)
            │
            └──► postgres (chỉ nội bộ)
```

- `api` và `postgres` không mở cổng ra host; mọi thứ đi qua nginx.
- Sidecar `certbot` cấp/gia hạn chứng chỉ qua HTTP-01 webroot; `web` tự tải lại nginx khi chứng chỉ hoặc cấu hình thay đổi.

## Triển khai

### Yêu cầu

- Một tên miền có quyền quản lý DNS (bản ghi MX bắt buộc để nhận thư)
- VPS có IP công khai; cổng **25** và **80** truy cập được (443 cho HTTPS bảng)
- Docker + Docker Compose, ~1 GB RAM (thêm swap trên VPS nhỏ), vài GB đĩa

### Cách A: kịch bản cài đặt tương tác

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

Kịch bản hỏi tên miền nhận thư, hostname email, cổng web, CORS và tùy chọn TLS, tạo `config.yaml` (kèm token quản trị ngẫu nhiên) và `.env`, in các bản ghi DNS rồi chạy `docker compose up -d --build`.

### Cách B: cấu hình thủ công

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) sửa config.yaml: domains, server.hostname, admin.token, mật khẩu DB
# 2) sửa .env: DB_PASSWORD (bắt buộc), WEB_PORT (mặc định 80)
mkdir -p certs
docker compose up -d --build
```

Lần truy cập đầu tiên sẽ mở **trình hướng dẫn /setup** (ví dụ có sẵn `setup.initialized: false`); điền các giá trị tương tự trên trình duyệt.

### Bản ghi DNS

```
mail.ten-mien-cua-ban.  IN  A    <IP máy chủ>      # hostname email
ten-mien-cua-ban.       IN  MX  10 mail.ten-mien-cua-ban.
```

Đồng thời yêu cầu nhà cung cấp VPS đặt DNS ngược (PTR) của IP máy chủ thành `mail.ten-mien-cua-ban`.

### Bật TLS / HTTPS cho bảng

1. Bảng quản trị → Cấu hình hệ thống → Tên miền truy cập bảng: điền ví dụ `mail.ten-mien-cua-ban` và trỏ bản ghi A của nó về máy chủ trong DNS
2. Thẻ chứng chỉ TLS → nhập email của bạn → **Cấp / gia hạn chứng chỉ** (chứng chỉ SAN bao phủ cả hostname email lẫn tên miền bảng)
3. Bật `tls.enabled` — MX khởi động STARTTLS ngay lập tức (không cần khởi động lại)
4. HTTPS bảng tự động phục vụ trên cổng 443; gia hạn hoàn toàn tự động

### Kiểm soát truy cập

Bảng quản trị → Công tắc → **Cho phép truy cập bảng người dùng qua IP / tên miền khác**:

- BẬT (mặc định): bảng truy cập được từ mọi địa chỉ
- TẮT: truy cập từ tên miền không chính thức và IP được chuyển hướng sang tên miền chính thức của bảng; `/admin`, `/api/*`, `/docs` và đường dẫn thử thách ACME vẫn truy cập được từ mọi địa chỉ để bạn không bao giờ bị khóa ngoài

### Cập nhật

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### Gỡ cài đặt

```bash
docker compose down -v   # -v cũng xóa toàn bộ dữ liệu thư
```

## Bảng quản trị và API

- Token quản trị: `admin.token` trong `config.yaml` (do `setup.sh` hoặc trình hướng dẫn tạo)
- Tham chiếu API với kiểm thử trực tiếp một chạm: `/api`; Swagger: `/docs`
- Xem [docs/admin-panel.md](docs/admin-panel.md) và [docs/security.md](docs/security.md)

## Tài liệu đa ngôn ngữ

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [Hướng dẫn triển khai](docs/deployment.md) ([简体中文](docs/deployment.zh-CN.md)) · [Bảng quản trị](docs/admin-panel.md) · [Bảo mật](docs/security.md)

## Giấy phép

[MIT](LICENSE) — dựa trên [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) và [Lm36/mailbucket](https://github.com/Lm36/mailbucket) (đều MIT).
