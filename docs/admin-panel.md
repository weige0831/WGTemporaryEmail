# 管理面板（Admin Panel）

tempmail-server 自带一个中文管理面板，与用户前端一起构建、一起部署。

- **用户前端**：`http://服务器IP/`（原 mailbucket 界面）
- **管理面板**：`http://服务器IP/admin`
- **API 文档**：`http://服务器IP/docs`（FastAPI Swagger）
- **首次配置向导**：`http://服务器IP/setup`（首次访问自动跳转）

## 首次配置向导

当 `config.yaml` 中 `setup.initialized: false`（或未设置该字段）时，访问任何页面都会
自动跳转到 `/setup` 向导，完成以下配置后服务即可使用：

- 收信域名（至少一个，可多个）
- 邮件服务器主机名（MX 记录指向的名称）
- 管理令牌（留空自动生成，生成后仅显示一次）
- 可选：地址有效期、总存储上限、是否允许自定义用户名、服务器公网 IP（用于生成 DNS 提示）

向导完成后会显示管理令牌和需要添加的 DNS 记录（A + MX）。完成即置
`setup.initialized: true`，之后向导接口返回 403，所有配置改由管理面板负责。
向导接口在未初始化期间无需认证，但有每 IP 每分钟 5 次的限流；请尽快完成初始化。

`setup.sh` 会交互式收集同样的配置并写入 `setup.initialized: true`，因此脚本部署的
机器不会再出现向导。

## 登录

管理面板使用 `config.yaml` 中的 `admin.token` 作为登录令牌：

```yaml
admin:
  token: YOUR_ADMIN_TOKEN
```

令牌只保存在浏览器 localStorage 中，每次请求通过 `Authorization: Bearer <token>` 发送。
修改 `admin.token` 后热重载立即生效（无需重启）。

## 功能

- **仪表盘**：域名列表、地址/邮件/附件统计、近 24 小时邮件、存储占用（含上限）、数据库状态、运行时长
- **邮件管理**：全站邮件搜索、查看详情（正文/邮件头/校验结果/附件）、删除
- **地址管理**：全站地址搜索、查看地址及其邮件、删除（连带删除其邮件）
- **域名管理**：添加/移除域名，实时生效（API 立即生效，MX 收信服务 ≤15 秒生效）
- **系统配置**：查看当前配置（敏感信息脱敏），热更新白名单字段（含邮件服务器主机名、管理令牌）
- **数据清理**：手动触发清理（过期地址 + 超出存储上限的最旧邮件）

## 存储上限

`tempmail.max_storage_mb`（默认 1024，即 1 GB）控制全站邮件（含附件）的总占用上限：

- `0` 表示不限制
- 当总占用超过上限时，清理任务会按 **最旧邮件优先** 删除邮件，直到低于上限
- 该检查随清理循环运行（每 `cleanup_interval_hours` 小时一次），也可在「数据清理」页手动触发
- 统计口径为 `emails.size_bytes`（整封原始邮件大小，含附件；删除邮件时附件级联删除）

同时，`max_emails_per_address` 现在会正确生效：MX 收信服务每次收信后异步检查该地址的邮件数，
超过则删除最旧的（此前该值被硬编码为 100，已修复）。

## 配置热更新说明

管理面板修改配置后，后端直接改写 `config.yaml` 并在进程内热重载：

- **API 服务**：`tempmail.*`、`validation.*`、`cors.allow_origins`、
  `server.max_message_size_mb`、`server.docs_enabled` 立即生效
- **MX 服务**：每 15 秒检测一次 `config.yaml`，域名列表、单封大小限制变更自动生效
- **例外**：`database.pool_size` / `database.max_overflow` 在连接池创建时读取，需重启 API 容器生效

注意：热更新改写 `config.yaml` 时 YAML 注释会丢失（值保持不变）。如需保留注释，直接手工编辑 `config.yaml` 后重启 API 容器即可。

## 管理 API

所有接口位于 `/api/v1/admin/*`，需要 `Authorization: Bearer <admin.token>` 请求头。
无令牌或令牌错误返回 401。接口列表（完整定义见 `/docs`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/admin/stats` | 系统统计 |
| GET | `/api/v1/admin/addresses` | 地址列表（分页、搜索） |
| GET | `/api/v1/admin/addresses/{id}` | 地址详情及其邮件 |
| DELETE | `/api/v1/admin/addresses/{id}` | 删除地址及其邮件 |
| GET | `/api/v1/admin/emails` | 全站邮件列表（分页、搜索） |
| GET | `/api/v1/admin/emails/{id}` | 邮件详情 |
| DELETE | `/api/v1/admin/emails/{id}` | 删除邮件 |
| GET | `/api/v1/admin/domains` | 域名列表（含用量统计） |
| POST | `/api/v1/admin/domains` | 添加域名 |
| DELETE | `/api/v1/admin/domains/{domain}` | 移除域名 |
| GET | `/api/v1/admin/config` | 查看配置（脱敏） |
| PUT | `/api/v1/admin/config` | 热更新白名单配置 |
| POST | `/api/v1/admin/cleanup/run` | 立即执行过期地址清理 |
