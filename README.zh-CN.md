# WGTemporaryEmail

一个隐私优先、可自托管的临时邮箱服务。

**示范站点：[https://mail.twcdk.com](https://mail.twcdk.com/)** · API 文档：[https://mail.twcdk.com/api](https://mail.twcdk.com/api) · 管理面板：`https://mail.twcdk.com/admin`

WGTemporaryEmail 基于两个优秀的开源项目整合构建，并扩展为一个完整、可上线的产品：

| 源项目 | 角色 | 本项目的扩展 |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | 后端（FastAPI API + Go MX 服务器 + PostgreSQL） | 管理 API（`/api/v1/admin/*`）与管理面板、首次配置向导、配置热更新、MX 配置热重载、存储上限自动清理、修复若干 bug（如 `max_emails_per_address` 曾被硬编码）、安全加固 |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | 用户前端（Next.js 15） | 集成进 `web/`、同源 API 调用、静态导出由 nginx 托管、中文管理面板 `/admin`、首次向导 `/setup`、XSS 消毒（DOMPurify）、16 语言国际化 |

所有项目均为 MIT 许可，保留原作者版权声明。感谢 [Lm36](https://github.com/Lm36) 的出色工作。

## 功能特性

- **符合 RFC 的 MX 服务器** - 在 25 端口接收任意邮件服务商投递的邮件
- **用户前端** - 收件箱、附件、原始邮件下载、DKIM/SPF/DMARC 徽章、暗色模式
- **管理面板**（16 语言）- 统计、邮件/地址/域名管理、配置热更新、手动清理
- **首次配置向导** - 在浏览器中完成域名、主机名、管理令牌与面板域名的配置
- **Let's Encrypt 自动化** - 后台一键签发、自动续期，MX 与面板 HTTPS 共用一张证书；续期后 MX 无需重启
- **存储控制** - `max_storage_mb` 上限，最旧邮件自动清理；另有单地址邮件数上限
- **访问控制** - 绑定面板域名后，可屏蔽 IP/其他域名对用户面板的访问；管理面板与 API 始终可达
- **安全** - 速率限制、XSS 消毒、ORM 防注入、令牌常量时间比较、容器非 root 运行、强制数据库密码、无弱默认值
- **16 种语言** - English、简体中文、繁體中文、日本語、한국어、Español、Français、Deutsch、Português、Русский、العربية（RTL）、हिन्दी、Italiano、Türkçe、Bahasa Indonesia、Tiếng Việt

## 架构

```
公网
  │
  ├─ :25  ───────────────► mx     (Go SMTP，每 15 秒热重载 config.yaml)
  │
  └─ :80 / :443 ────────► web    (nginx：静态前端 + 反向代理)
       ├─ /                  用户面板（16 语言）
       ├─ /admin             管理面板（16 语言）
       ├─ /setup             首次配置向导
       ├─ /api/* ──────────► api    (FastAPI，仅内网)
       ├─ /docs、/openapi.json ──► api    (Swagger)
       └─ /.well-known/acme-challenge/  (供 certbot 边车验证)
            │
            └──► postgres（仅内网）
```

- `api` 与 `postgres` 不映射宿主端口，全部经 nginx 访问。
- `certbot` 边车通过 HTTP-01 webroot 方式签发/续期证书；证书或配置变化时 `web` 自动热重载 nginx。

## 部署

### 环境要求

- 一个可管理 DNS 的域名（收信必须配 MX 记录）
- 一台有公网 IP 的 VPS；**25** 与 **80** 端口可达（面板 HTTPS 需要 443）
- Docker + Docker Compose，约 1 GB 内存（小机器建议加 swap）、数 GB 磁盘

### 方式 A：交互式安装脚本

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

脚本会询问收信域名、邮件主机名、Web 端口、CORS、TLS 选项，随后生成 `config.yaml`（含随机管理令牌）与 `.env`、打印 DNS 记录，并执行 `docker compose up -d`。

### 方式 B：手动配置

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 1) 编辑 config.yaml：domains、server.hostname、admin.token、数据库密码
# 2) 编辑 .env：DB_PASSWORD（必填）、WEB_PORT（默认 80）
mkdir -p certs
docker compose up -d --build
```

首次访问会进入 **/setup 配置向导**（示例配置默认 `setup.initialized: false`），在浏览器中填写同样的内容即可。

### DNS 记录

```
mail.你的域名.     IN  A    <服务器 IP>      # 邮件主机名
你的域名.          IN  MX  10 mail.你的域名.
```

同时请向 VPS 服务商申请把服务器 IP 的反解（PTR）设置为 `mail.你的域名`。

### 启用 TLS / 面板 HTTPS

1. 管理面板 → 系统配置 → 面板访问域名：填写如 `mail.你的域名`，并在 DNS 中把该域名 A 记录指向服务器
2. TLS 证书卡片 → 填写邮箱 → **签发 / 续期证书**（SAN 证书同时覆盖邮件主机名与面板域名）
3. 打开 `tls.enabled` 开关——MX 立即启用 STARTTLS（无需重启）
4. 面板 HTTPS 自动在 443 提供服务；证书自动续期

### 访问控制

管理面板 → 功能开关 → **允许通过 IP / 其他域名访问用户面板**：

- 开（默认）：任何地址都能访问用户面板
- 关：非正式域名与 IP 的访问会被重定向到正式面板域名；`/admin`、`/api/*`、`/docs` 与证书验证路径始终可从任何地址访问，绝不会把自己锁在外面

### 日志与磁盘自动清理

- 邮件数据：过期地址自动删除，全站总量受 `max_storage_mb` 上限约束（默认 1 GB），最旧邮件优先清理
- 容器日志：每个服务按 10 MB × 3 个文件轮转（单容器最多 30 MB）
- 构建缓存：每周自动执行 `docker system prune` + `docker builder prune`（cron）
- apt 缓存：每月自动执行 `apt-get autoclean`（cron）
- journald 限制为 200 MB；以上配置由 `setup.sh` 自动完成

### 更新

```bash
cd WGTemporaryEmail
git pull
docker compose build
docker compose up -d --fo
数据库迁移位于 `db/migrations/`，全部幂等可重复执行。只有从旧版本升级时才需要执行；全新安装由 `db/init/schema.sql` 建好完整结构。
rce-recreate
# apply database migrations (idempotent; only needed when upgrading an existing install)
docker compose exec -T postgres psql -U tempmail -d tempmail < db/migrations/002_permanent_addresses.sql
```

### 卸载

```bash
docker compose down -v   # -v 会同时删除所有邮件数据
```

## 长效邮箱与集成 API

除自动过期的临时邮箱外，服务还提供**长效邮箱**：地址永久保留，邮件在保留期（`tempmail.permanent_email_retention_days`，默认 30 天）后自动删除。

- 可用 `tempmail.max_permanent_addresses` 限制长效邮箱总数（0 表示不限制）。
- **网页端**：`/mailbox` —— 自选用户名创建，保存访问令牌，之后在任何设备用令牌登录。收件箱与临时邮箱一致（搜索、自动刷新、HTML/纯文本、附件、下载原始邮件）。
- **API（需鉴权）**：`POST /api/v1/api/addresses`，请求头 `X-API-Key: <集成密钥>`，请求体 `{"username": "...", "domain": "..."}`。
- **集成密钥**：管理面板 → 系统配置 → **集成 API 密钥**（查看状态 / 重新生成，仅显示一次）。
- 网页端直接创建无需密钥，按 IP 限流。

## 备份与恢复

- **数据库**（全部地址、邮件与附件）：
  ```bash
  docker exec tempmail_db pg_dump -U tempmail tempmail | gzip > backup-$(date +%F).sql.gz
  docker exec -i tempmail_db psql -U tempmail -d tempmail < backup.sql   # 恢复
  ```
- **配置**：`config.yaml`（管理令牌、数据库密码、集成密钥）与 `.env`，请另存备份——它们不在 git 中。
- **TLS**：`certs/`（`cert.pem`、`key.pem`），丢失可在面板重新签发。

## 长效邮箱与集成 API

除自动过期的临时邮箱外，服务还提供**长效邮箱**：地址永久保留，邮件在保留期（`tempmail.permanent_email_retention_days`，默认 30 天）后自动删除。

- **网页端**：`/mailbox` —— 自选用户名创建，保存访问令牌，之后在任何设备用令牌登录。收件箱与临时邮箱一致（搜索、自动刷新、HTML/纯文本、附件、下载原始邮件）。
- **API（需鉴权）**：`POST /api/v1/api/addresses`，请求头 `X-API-Key: <集成密钥>`，请求体 `{"username": "...", "domain": "..."}`。
- **集成密钥**：管理面板 → 系统配置 → **集成 API 密钥**（查看状态 / 重新生成，仅显示一次）。
- 网页端直接创建无需密钥，按 IP 限流。

## 备份与恢复

- **数据库**（全部地址、邮件与附件）：
  ```bash
  docker exec tempmail_db pg_dump -U tempmail tempmail | gzip > backup-$(date +%F).sql.gz
  docker exec -i tempmail_db psql -U tempmail -d tempmail < backup.sql   # 恢复
  ```
- **配置**：`config.yaml`（管理令牌、数据库密码、集成密钥）与 `.env`，请另存备份——它们不在 git 中。
- **TLS**：`certs/`（`cert.pem`、`key.pem`），丢失可在面板重新签发。

## 管理面板与 API

- 管理令牌：`config.yaml` 中的 `admin.token`（由 `setup.sh` 或配置向导生成）
- 带一键在线测试的 API 文档：`/api`；Swagger：`/docs`
- 详见 [docs/admin-panel.md](docs/admin-panel.md) 与 [docs/security.md](docs/security.md)

## 多语言文档

- [English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [Italiano](README.it.md) · [Türkçe](README.tr.md) · [Bahasa Indonesia](README.id.md) · [Tiếng Việt](README.vi.md)
- [部署指南](docs/deployment.md)（[简体中文](docs/deployment.zh-CN.md)）· [管理面板](docs/admin-panel.md) · [安全说明](docs/security.md)

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## 许可证

[MIT](LICENSE) —— 基于 [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) 与 [Lm36/mailbucket](https://github.com/Lm36/mailbucket)（均为 MIT）。
