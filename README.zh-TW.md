# WGTemporaryEmail

一個隱私優先、可自行架設的拋棄式臨時信箱服務。

**示範站點：[https://mail.twcdk.com](https://mail.twcdk.com/)** · API 文件：[https://mail.twcdk.com/api](https://mail.twcdk.com/api) · 管理面板：`https://mail.twcdk.com/admin`

WGTemporaryEmail 基於兩個優秀的開源專案整合建構，並擴充為一個完整、可直接上線的產品：

| 原始專案 | 角色 | 本專案的擴充 |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | 後端（FastAPI API + Go MX 伺服器 + PostgreSQL） | 管理 API（`/api/v1/admin/*`）與管理面板、首次設定精靈、設定熱更新、MX 設定熱重載、儲存上限自動清理、修復多項 bug（如 `max_emails_per_address` 曾被寫死）、安全強化 |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | 使用者前端（Next.js 15） | 整合進 `web/`、同源 API 呼叫、靜態匯出由 nginx 託管、中文管理面板 `/admin`、首次精靈 `/setup`、XSS 消毒（DOMPurify）、16 語言國際化 |

所有專案皆為 MIT 授權，保留原作者版權聲明。感謝 [Lm36](https://github.com/Lm36) 的出色工作。

## 功能特性

- **符合 RFC 的 MX 伺服器** - 於 25 連接埠接收任何郵件服務商投遞的郵件
- **使用者前端** - 收件匣、附件、原始郵件下載、DKIM/SPF/DMARC 徽章、暗色模式
- **管理面板**（16 語言）- 統計、郵件/地址/網域管理、設定熱更新、手動清理
- **首次設定精靈** - 在瀏覽器中完成網域、主機名稱、管理權杖與面板網域的設定
- **Let's Encrypt 自動化** - 後台一鍵簽發、自動續期，MX 與面板 HTTPS 共用一張憑證；續期後 MX 無需重新啟動
- **儲存控制** - `max_storage_mb` 上限，最舊郵件自動清理；另有單一地址郵件數上限
- **存取控制** - 綁定面板網域後，可封鎖 IP/其他網域對使用者面板的存取；管理面板與 API 永遠可達
- **安全** - 速率限制、XSS 消毒、ORM 防注入、權杖常數時間比較、容器非 root 執行、強制資料庫密碼、無弱預設值
- **16 種語言** - English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português、Русский、العربية（RTL）、हिन्दी、Italiano、Türkçe、Bahasa Indonesia、Tiếng Việt

## 架構

```
網際網路
  │
  ├─ :25  ───────────────► mx     (Go SMTP，每 15 秒熱重載 config.yaml)
  │
  └─ :80 / :443 ────────► web    (nginx：靜態前端 + 反向代理)
       ├─ /                  使用者面板（16 語言）
       ├─ /admin             管理面板（16 語言）
       ├─ /setup             首次設定精靈
       ├─ /api/* ──────────► api    (FastAPI，僅內網)
       ├─ /docs、/openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (供 certbot 邊車驗證)
            │
            └──► postgres（僅內網）
```

- `api` 與 `postgres` 不映射宿主連接埠，全部經 nginx 存取。
- `certbot` 邊車以 HTTP-01 webroot 方式簽發/續期憑證；憑證或設定變化時 `web` 自動熱重載 nginx。

## 部署

### 環境需求

- 一個可管理 DNS 的網域（收信必須設定 MX 記錄）
- 一台有公網 IP 的 VPS；**25** 與 **80** 連接埠可達（面板 HTTPS 需要 443）
- Docker + Docker Compose，約 1 GB 記憶體（小機器建議加 swap）、數 GB 磁碟

### 方式 A：互動式安裝腳本

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

腳本會詢問收信網域、郵件主機名稱、Web 連接埠、CORS、TLS 選項，接著產生 `config.yaml`（含隨機管理權杖）與 `.env`、列印 DNS 記錄，並執行 `docker compose up -d --build`。

### 方式 B：手動設定

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) 編輯 config.yaml：domains、server.hostname、admin.token、資料庫密碼
# 2) 編輯 .env：DB_PASSWORD（必填）、WEB_PORT（預設 80）
mkdir -p certs
docker compose up -d --build
```

首次存取會進入 **/setup 設定精靈**（範例設定預設 `setup.initialized: false`），在瀏覽器中填寫同樣的內容即可。

### DNS 記錄

```
mail.你的網域.     IN  A    <伺服器 IP>      # 郵件主機名稱
你的網域.          IN  MX  10 mail.你的網域.
```

同時請向 VPS 服務商申請把伺服器 IP 的反解（PTR）設定為 `mail.你的網域`。

### 啟用 TLS / 面板 HTTPS

1. 管理面板 → 系統設定 → 面板存取網域：填寫如 `mail.你的網域`，並於 DNS 中把該網域 A 記錄指向伺服器
2. TLS 憑證卡片 → 填寫信箱 → **簽發 / 續期憑證**（SAN 憑證同時涵蓋郵件主機名稱與面板網域）
3. 開啟 `tls.enabled` 開關——MX 立即啟用 STARTTLS（無需重新啟動）
4. 面板 HTTPS 自動於 443 提供服務；憑證自動續期

### 存取控制

管理面板 → 功能開關 → **允許透過 IP / 其他網域存取使用者面板**：

- 開（預設）：任何位址都能存取使用者面板
- 關：非正式網域與 IP 的存取會被重新導向到正式面板網域；`/admin`、`/api/*`、`/docs` 與憑證驗證路徑永遠可從任何位址存取，絕不會把自己鎖在外面

### 更新

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d
```

### 解除安裝

```bash
docker compose down -v   # -v 會同時刪除所有郵件資料
```

## 管理面板與 API

- 管理權杖：`config.yaml` 中的 `admin.token`（由 `setup.sh` 或設定精靈產生）
- 帶一鍵線上測試的 API 文件：`/api`；Swagger：`/docs`
- 詳見 [docs/admin-panel.md](docs/admin-panel.md) 與 [docs/security.md](docs/security.md)

## 多語言文件

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [部署指南](docs/deployment.md)（[简体中文](docs/deployment.zh-CN.md)）· [管理面板](docs/admin-panel.md) · [安全說明](docs/security.md)

## 授權

[MIT](LICENSE) —— 基於 [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) 與 [Lm36/mailbucket](https://github.com/Lm36/mailbucket)（均為 MIT）。
