# 部署指南

在任何支持 Docker 的 VPS 上部署 WGTemporaryEmail。

**示范站点：https://mail.twcdk.com** · **API 文档：https://mail.twcdk.com/api**

## 前置条件

- 一个可管理 DNS 的域名（收信必须有 MX 记录）
- 有公网 IP 的 VPS；**25** 与 **80** 端口可达（面板 HTTPS 需要 **443**）
- Docker + Docker Compose，约 1 GB 内存（小机器请加 swap）、数 GB 磁盘

## 快速部署（setup.sh）

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
./setup.sh
```

脚本会：

1. 询问收信域名、邮件主机名、Web 端口、CORS 来源、TLS 选项
2. 生成 `config.yaml`（含随机管理令牌）与 `.env`（数据库密码、Web 端口）
3. 打印需要添加的 DNS 记录
4. 执行 `docker compose up -d --build`

## 手动部署

```bash
git clone https://github.com/weige0831/WGTemporaryEmail.git
cd WGTemporaryEmail
cp config.yaml.example config.yaml
cp .env.example .env
# 编辑 config.yaml（domains、server.hostname、admin.token、数据库密码）
# 编辑 .env（DB_PASSWORD 必填，WEB_PORT 默认 80）
mkdir -p certs
docker compose up -d --build
```

首次访问会打开 **/setup 配置向导**（示例配置默认 `setup.initialized: false`），在浏览器中填写同样的内容即可。`setup.sh` 因已交互式收集全部信息，会直接写入 `setup.initialized: true`。

## DNS 记录

```
mail.你的域名.     IN  A    服务器IP        # 邮件主机名
你的域名.          IN  MX  10 mail.你的域名.
```

同时请向 VPS 服务商申请把服务器 IP 的反解（PTR）设为 `mail.你的域名`。

DNS 生效需等待 5-60 分钟。

## 端口

| 端口 | 服务 | 用途 |
|---|---|---|
| 25 | mx | SMTP 收信（必须公网可达） |
| 80 | web | 用户面板、管理面板、API、ACME 验证 |
| 443 | web | 面板 HTTPS（推荐） |
| 8000 / 5432 | api / postgres | 仅 Docker 内网 |

## TLS 证书

- 在管理面板签发：系统配置 → TLS 证书卡片 → 填写邮箱 → 签发 / 续期证书
- 采用 HTTP-01 方式，验证路径由 nginx 提供（`/.well-known/acme-challenge/`）
- SAN 证书同时覆盖邮件主机名与面板域名（`web.hostname`）
- 每天自动检查续期；新证书对 MX（每次握手懒加载）与 nginx（自动 reload）均无需重启即生效
- 打开 `tls.enabled` 即可为 MX 启用 STARTTLS（15 秒内热生效）

## 面板访问域名与 IP 访问控制

- `web.hostname`：面板正式域名（如 `mail.你的域名`），需为其添加指向服务器的 A 记录
- `web.allow_ip_access`（默认 true）：关闭后，通过其他域名或 IP 访问用户面板会被重定向到正式域名；`/admin`、`/api/*`、`/docs` 与 ACME 验证路径始终可从任何地址访问，防止把自己锁在外面

## 验证部署

```bash
docker compose ps                     # 所有容器健康
curl http://localhost/api/v1/health   # 经 nginx 的 API
curl http://localhost/api/v1/domains  # 已配置域名
```

然后打开 `http://服务器IP/`（或面板域名），完成配置向导，并从外部邮箱发一封测试邮件。

## 日志与磁盘自动清理

邮件数据由应用自身自动清理（过期地址 + `max_storage_mb` 上限，见 [docs/admin-panel.md](admin-panel.md)）。主机层面的积累由以下机制处理：

- **容器日志**：compose 中每个服务都设置了 `max-size: 10m / max-file: 3`；`setup.sh` 还会写入 `/etc/docker/daemon.json` 设置同样的全局默认，使同主机上的其他容器（如无关项目）也会轮转
- **journald**：通过 `/etc/systemd/journald.conf` 限制为 200M
- **定时清理**：`/etc/cron.d/wgtempemail-cleanup` 每周执行 `docker system prune` + `docker builder prune`，每月执行 `apt-get autoclean`

手动一次性清理：

```bash
apt-get clean                 # apt 缓存
docker builder prune -f       # 构建缓存
journalctl --vacuum-size=200M
```

## 更新

```bash
git pull
docker compose build
docker compose up -d
```

## 卸载

```bash
docker compose down -v   # -v 会删除所有邮件数据
```

## 常见问题

- **收不到邮件**：检查 `dig MX 你的域名`、`telnet mail.你的域名 25`、`docker compose logs mx`，并确认地址存在（`POST /api/v1/addresses`）
- **证书签发失败**：邮件主机名的 A 记录必须指向本服务器，且 80 端口公网可达；查看 `docker logs tempmail_certbot`
- **面板出现跳转**：`web.allow_ip_access` 已关闭且你用了非正式地址——请用正式面板域名访问（管理面板从任何地址仍可用）

## 升级已有安装

```bash
git pull
docker compose exec -T postgres psql -U tempmail -d tempmail < db/migrations/002_permanent_addresses.sql
docker compose build
docker compose up -d --force-recreate
```

数据库迁移位于 `db/migrations/`，全部幂等可重复执行。从旧版本升级时需要执行；全新安装由 `db/init/schema.sql` 直接建好完整结构。

## 磁盘紧张的部署方式（预构建前端）

`web/Dockerfile` 会在构建阶段执行 `npm ci && next build`，需要约 1GB 临时空间。
在已经存有邮件数据的小型 VPS 上可能因 `ENOSPC: no space left on device` 失败。

此时改为"本地构建静态产物、服务器只打包镜像"：

```bash
# 本地
cd web && npm ci && npm run build          # 产物在 web/out
tar -czf webprebuilt.tar.gz -C web out Dockerfile.runtime locations.conf entrypoint.sh
scp webprebuilt.tar.gz root@服务器:/root/

# 服务器
cd /root/tempmail-server/web && tar -xzf /root/webprebuilt.tar.gz
cd /root/tempmail-server
docker compose build api mx                # 不涉及 npm
mkdir -p /root/webimg && cp -r web/out web/locations.conf web/entrypoint.sh     web/Dockerfile.runtime /root/webimg/
docker build -f /root/webimg/Dockerfile.runtime -t tempmail-server-web /root/webimg
docker compose up -d --no-build
```

注意：必须用干净的构建目录（`/root/webimg`）——`web/.dockerignore` 排除了 `out/`，
以 `web/` 为上下文构建会看不到静态产物。
