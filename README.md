# WGTemporaryEmail

An inbound-only mail server and REST API for integrating with apps or building temp-mail sites in minutes.

> 本仓库：https://github.com/weige0831/WGTemporaryEmail

本仓库集成了三部分，`docker compose up -d` 一键启动：

- **后端**：PostgreSQL + FastAPI 收信服务（`api/`）+ Go MX 收信服务器（`mx/`）
- **用户前端**（`web/`）：基于 [mailbucket](https://github.com/Lm36/mailbucket) 的临时邮箱界面，静态导出后由 Nginx 托管
- **管理面板**（`web/app/admin/`，中文）：统计总览、邮件/地址/域名管理、配置热更新、手动清理，见 [docs/admin-panel.md](docs/admin-panel.md)

## 与源项目的关系

本项目基于以下开源项目整合构建（均采用 MIT 许可证，保留原作者版权声明）：

| 源项目 | 角色 | 本项目在其中的改动 |
|---|---|---|
| [Lm36/tempmail-server](https://github.com/Lm36/tempmail-server) | 收信后端（FastAPI API + Go MX + PostgreSQL） | 新增管理 API（`/api/v1/admin/*`）与管理面板、首次配置向导、配置热更新、MX 配置热重载、存储占用上限自动清理、修复 `max_emails_per_address` 无效等 bug、安全加固（速率限制、LIKE 通配符转义、依赖安全升级、移除弱默认密码） |
| [Lm36/mailbucket](https://github.com/Lm36/mailbucket) | 用户前端（Next.js 15） | 集成进本仓库 `web/`、改为同源调用、静态导出由 Nginx 托管、新增中文管理面板 `/admin`、XSS 消毒（DOMPurify）、首次配置向导 `/setup` |

感谢 [Lm36](https://github.com/Lm36) 的出色工作。

## Documentation

- **[API Server](docs/api-server.md)** - REST API overview and quick start
- **[MX Server](docs/mx-server.md)** - SMTP server details
- **[Deployment](docs/deployment.md)** - Production deployment guide
- **[Admin Panel](docs/admin-panel.md)** - 管理面板与 /api/v1/admin/* 接口说明
- **[Security](docs/security.md)** - 已实施的安全控制与部署安全注意事项
- **[Interactive API Docs](https://lm36.github.io/tempmail-server)** - Full Swagger/OpenAPI documentation (auto-generated)

## Features
- **RFC Compliant MX SMTP server** - Receive mail from any email provider
- **One-command deployment** - Setup script handles everything
- **Web frontend included** - mailbucket 用户界面（收件箱、附件、DKIM/SPF/DMARC 徽章、暗色模式）
- **Admin panel included** - 中文管理面板（统计、邮件/地址/域名管理、配置热更新、手动清理）
- **Custom or random usernames** - Choose your own username or auto-generate
- **Multi-domain support** - Configure and select from multiple domains
- **Token-based API access** - No user authentication needed
- **Auto-expiration** - Addresses and emails deleted after 24h (configurable)
- **Full MIME support** - HTML, plain text, attachments
- **Email validation** - DKIM, SPF, DMARC checking (results stored, not enforced)
- **PostgreSQL storage** - Reliable, concurrent-safe
- **Docker-based** - Simple deployment with Docker Compose

## Quick Start

### Prerequisites

- Domain name with DNS access
- VPS with public IP
- Docker and Docker Compose installed
- Git installed

### Deploy

```bash
# Clone the repository
git clone https://github.com/lm36/tempmail-server.git
cd tempmail-server

# Run the interactive setup script
./setup.sh

# The script will:
# 1. Ask for your domains, hostname, web port
# 2. Generate config.yaml (含管理面板令牌), .env and DNS records
# 3. Deploy everything with Docker
```

部署完成后：

- 用户前端：`http://服务器IP/`（端口见 `.env` 的 `WEB_PORT`，默认 80）
- 管理面板：`http://服务器IP/admin`（令牌在 `config.yaml` 的 `admin.token`）
- API 文档：`http://服务器IP/docs`

### 架构

```
外部流量
  │
  ├─ :25 ────────────────► mx (Go SMTP 收信，每 15s 热重载 config.yaml)
  │
  └─ :80 (WEB_PORT) ─────► web (nginx)
        ├─ /            静态用户前端 (mailbucket)
        ├─ /admin       静态管理面板（中文）
        ├─ /api/* ─────► api (FastAPI, 内部网络)
        └─ /docs ──────► api (Swagger)
                            │
                            └──► postgres (仅内部网络)
```

说明：`api` 服务不映射宿主端口，只通过 `web`（nginx）代理访问；管理面板修改配置时由 `api`
以 root 身份改写挂载的 `config.yaml` 并热重载（详见 [docs/admin-panel.md](docs/admin-panel.md)）。

## API Usage

### Generate a temporary email address

```bash
# Random username (8 characters)
curl -X POST http://localhost:8000/api/v1/addresses

# Custom username
curl -X POST http://localhost:8000/api/v1/addresses \
  -H "Content-Type: application/json" \
  -d '{"username": "john.doe"}'

# Custom username with domain selection
curl -X POST http://localhost:8000/api/v1/addresses \
  -H "Content-Type: application/json" \
  -d '{"username": "myemail", "domain": "temp.example.com"}'

# Response:
# {
#   "email": "myemail@temp.example.com",
#   "token": "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "expires_at": "2025-11-18T12:00:00Z"
# }
```

The "token" is used for fetching emails for and managing that address

### List available domains

```bash
curl http://localhost:8000/api/v1/domains

# Response:
# {
#   "domains": ["example.com", "temp.example.com"]
# }
```

### List emails for an address

```bash
curl http://localhost:8000/api/v1/{token}/emails

# Response:
# {
#   "emails": [
#     {
#       "id": "uuid",
#       "subject": "Welcome!",
#       "from": "sender@example.com",
#       "received_at": "2025-11-17T10:30:00Z",
#       "is_read": false,
#       "has_attachments": true
#     }
#   ],
#   "total": 1,
#   "page": 1,
#   "per_page": 50
# }
```

### Get email details

```bash
curl http://localhost:8000/api/v1/{token}/emails/{email_id}

# Response includes:
# - Full headers
# - Plain text body
# - HTML body
# - Validation results (DKIM, SPF, DMARC)
# - Attachment list
```
## Configuration

Configuration is managed via `config.yaml`:

```yaml
domains:
  - example.com
  - temp.example.com

database:
  url: postgresql://tempmail:CHANGE_THIS_PASSWORD@postgres:5432/tempmail
  pool_size: 10
  max_overflow: 20

server:
  api_host: 127.0.0.1
  api_port: 8000
  mx_port: 25
  max_message_size_mb: 10
  hostname: mail.example.com
  docs_enabled: true

cors:
  allow_origins:
    - "*"  # In production, specify your frontend domains
  allow_credentials: true
  allow_methods:
    - "*"
  allow_headers:
    - "*"

tls:
  enabled: false
  cert_file: /config/certs/cert.pem
  key_file: /config/certs/key.pem

tempmail:
  address_lifetime_hours: 24
  max_emails_per_address: 100
  cleanup_interval_hours: 1
  address_format: random
  allow_custom_usernames: true
  min_username_length: 3
  max_username_length: 64
  reserved_usernames:
    - admin
    - postmaster
    - abuse
    - noreply
    - no-reply
    - root
    - webmaster
    - hostmaster
    - mailer-daemon
    - info
    - support
    - security
    - sales
    - contact

validation:
  check_dkim: true
  check_spf: true
  check_dmarc: true
  store_results: true
```

## Development

### Local development

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f api
docker compose logs -f mx

# Stop services
docker compose down
```

### Run tests

```bash
# API tests (Python)
cd api
pytest -v --cov=app tests/

# MX server tests (Go)
cd mx
go test -v -cover ./...
```

## License

[MIT License](LICENSE)
