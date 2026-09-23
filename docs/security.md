# 安全说明（Security）

本文档汇总本项目已实施的安全控制与部署时的安全注意事项。

## 已实施的安全控制

- **认证**：
  - 用户地址访问使用 `secrets.token_urlsafe(48)` 生成的 64 位高熵令牌
  - 管理面板令牌比较使用 `hmac.compare_digest`（常量时间，防时序侧信道）
- **速率限制**（内存滑动窗口，按 IP）：
  - `POST /api/v1/addresses`：每 IP 每分钟 10 次
  - `/api/v1/admin/*`：每 IP 每分钟 30 次（防令牌暴力破解）
- **SQL 注入防护**：全部数据库访问走 SQLAlchemy ORM 参数化查询；LIKE 搜索对
  `%` / `_` / `\` 做了通配符转义
- **XSS 防护**：邮件 HTML 正文渲染前经 DOMPurify 消毒，iframe 使用空 `sandbox`
  （不授予脚本执行能力）
- **附件下载**：文件名清洗 `/`、`\` 防止路径穿越
- **越权防护**：每条邮件/附件路由都校验 token 与地址的归属关系
- **开放中继防护**：MX 在 RCPT 阶段校验域名白名单 + 地址存在性
- **配置安全**：
  - `GET /admin/config` 对所有密钥类字段脱敏（按字段名匹配 token/api_key/secret/password），包括数据库密码、管理令牌与集成 API 密钥；管理面板展示前还会再过滤一次
  - `PUT /admin/config` 仅允许白名单字段；`admin.token` 在白名单内，属于有意的「轮换令牌」能力（调用者必须已知当前令牌，不构成提权），面板退出后请用新令牌登录
- **最小暴露**：postgres 与 api 不映射宿主端口，仅 mx(25) 与 web(80) 对外

## 容器以非 root 运行

`api`、`mx`、`postgres` 以非 root 用户运行（api 与 mx 为 uid 1000；`web`(nginx) 与`certbot` 需要绑定 80/443 与写入证书目录，仍以 root 运行，已通过只读根文件系统、`cap_drop`、`no-new-privileges` 与网络隔离收敛权限）。以下描述以 api 为例（api 为 uid 1000 的
`tempmail` 用户）。为使管理面板热更新能写回挂载的 `config.yaml`，`setup.sh`
会将该文件属主设为 uid 1000（或回退为 `chmod 666`）。

## 部署时的安全注意事项

1. **务必运行 `./setup.sh`** 生成随机 `DB_PASSWORD` 与管理令牌，不要沿用示例占位值。
   若手动配置，`DB_PASSWORD` 未设置时 `docker compose up` 会直接报错退出（无弱默认值）。
2. **首次配置向导**：`setup.initialized: false` 时 `/api/v1/setup/complete` 无需认证即可
   写入配置（每 IP 每分钟限 5 次）。请部署后第一时间完成向导（或使用 setup.sh 部署），
   完成后该接口即返回 403。
3. **CORS**：集成部署为同源（nginx 反代 `/api`），无需跨域。`allow_credentials`
   默认 `false`；如需跨域请显式列出前端域名，不要用 `*`。
3. **速率限制为进程内实现**：适用于单 uvicorn worker（本 compose 默认部署形态）。
   若水平扩容到多 worker/多实例，需改用共享存储（如 Redis）限流。
4. **反代 IP 透传**：`web/entrypoint.sh` 生成的 nginx 配置用 `X-Forwarded-For $remote_addr` 覆盖传递真实
   客户端 IP。若在 web 前再套一层 CDN/LB，需在那一层正确设置 `X-Forwarded-For`，
   否则限流统计的 IP 会失真。

## 速率限制一览

| 端点 | 限制 |
| --- | --- |
| `POST /api/v1/addresses` | 50 次/分钟/IP（可配置） |
| `POST /api/v1/permanent-addresses` | 20 次/分钟/IP（可配置） |
| `POST /api/v1/api/addresses`（需 X-API-Key） | **默认不限制**（可用 `api_create_per_minute` 开启，或依赖 `max_permanent_addresses` 控制总量） |
| `POST /api/v1/setup/complete` | 5 次/分钟/IP |
| `/api/v1/admin/*` | 120 次/分钟/IP（可配置） |
| `/api/v1/{token}/*`（读取/下载） | 300 次/分钟/IP（可配置） |
| nginx 边缘限流 | `/api/` 120 次/分钟，`/api/v1/setup/` 与 `/api/v1/admin/` 30 次/分钟 |

## 首次安装的抢注防护

镜像为未初始化的实例生成一次性安装密钥（`setup.key`），并在启动日志中打印：
`docker compose logs api | grep 'Setup key'`。向导必须提交该密钥才能完成初始化，
因此互联网上的陌生人无法抢先接管一个刚部署好的实例。

## 令牌与日志

- 邮箱令牌是 URL 路径的一部分（`/api/v1/{token}/...`）。nginx 访问日志通过
  `map` 规则把该段替换为 `<token>`，API 容器则完全关闭了 uvicorn 访问日志，
  避免邮箱凭据落进 `docker logs`。
- 管理令牌、集成密钥只保存在浏览器 localStorage，请勿在共享设备上登录管理面板。

## 已接受的风险（附理由）

以下项目经评估后选择保留，理由一并记录，便于后续复核：

- **PostgreSQL 使用镜像默认的超级用户**：`tempmail` 角色由官方镜像创建为超级用户。
  数据库端口未对外暴露、应用全部使用参数化查询（已核查无字符串拼接），且
  没有提供更低权限角色的可行路径（对象属主即该角色）。若要彻底收敛，需要
  自行初始化角色并在 `db/init` 中授权。
- **令牌明文存储**：`addresses.token` 以明文入库。同一库里本来就存放着邮件
  正文，因此哈希化带来的边际收益很小；同时系统提供的是"令牌即邮箱"的模型。
  代价是：拿到数据库即可读任意邮箱——这与拿到数据库即可读全部邮件等价。
- **邮箱 HTML 中的远程图片**：渲染邮件时允许加载外部图片（追踪像素）。这是
  HTML 邮件的固有行为；如需彻底阻断，可默认切换到纯文本视图或加图片代理。
- **`X-Forwarded-For` 直接采信第一个值**：nginx 以 `$remote_addr` 覆盖写入，
  且 api 端口未发布；仅当有人额外加一层会"追加"而非"覆盖"的代理时才会失效。
- **`setup.sh` 的宿主 certbot 路径**：与容器内 certbot 各自管理证书目录，二者
  不共享续期状态；容器化路径（面板一键签发）是推荐方式，宿主路径仅为兼容保留。

## 容器隔离现状

- `web`(nginx) 不再挂载 `config.yaml`：api 容器会把 nginx 需要的四个开关
  （`WEB_HOSTNAME`、`ALLOW_IP`、`TLS_ENABLED`、`DOCS_ENABLED`）写入共享卷里的
  `web-config.env`，前端容器因此拿不到数据库密码与管理令牌。
- 网络分为 `frontend`（web↔api）与 `backend`（api↔mx↔postgres↔certbot），
  被攻陷的 nginx 无法直连数据库。
- `api`/`mx` 以只读根文件系统 + `cap_drop: ALL` + `no-new-privileges` 运行，
  并设置了内存与 PID 上限。
- `certs/` 以只读方式挂载进 web，自签名占位证书保存在镜像内部目录，
  前端容器无法替换 MX 信任的证书。

以上限流值都可在**管理面板 → 系统配置 → 限流**或 `config.yaml` 的 `rate_limits:` 段调整
（0 表示关闭该限制），修改后**立即生效**，无需重启。注意限流按**客户端 IP** 计算：
公司网络/移动网络等共享出口 IP 的用户会共用同一额度，因此创建类限制建议留出余量。
如果服务前面还有一层会「追加」而非「覆盖」`X-Forwarded-For` 的代理，需要相应调整
`api/app/rate_limit.py` 的取值逻辑。

## 数据库连接池与自愈

- API 连接池容量为 `pool_size + max_overflow`（默认 20 + 80 = 100 并发），
  `pool_timeout` 为 10 秒：拿不到连接时快速报错，不会长时间挂起。
- Postgres 设置了 `idle_in_transaction_session_timeout=60s`：任何被挂起请求
  遗留的空闲事务会自动终止，不会永久占住连接槽位。
- `FAULTHANDLER_SECONDS`（compose 默认 120）会让 API 定期把所有线程栈打进容器
  日志；连接池使用率达到 80% 时看门狗也会告警并转储线程栈，便于定位"卡住"问题。
- 若需调整池大小：改 `config.yaml` 的 `database.pool_size / max_overflow`，
  并同步确保 Postgres 的 `max_connections`（compose 中为 200）足够容纳。
