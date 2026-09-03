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
  - `GET /admin/config` 对数据库密码与管理令牌脱敏
  - `PUT /admin/config` 仅允许白名单字段，无法修改 `admin.token`（防提权）
- **最小暴露**：postgres 与 api 不映射宿主端口，仅 mx(25) 与 web(80) 对外

## 容器以非 root 运行

`api`、`mx`、`web`、`postgres` 容器均以非 root 用户运行（api 为 uid 1000 的
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
4. **反代 IP 透传**：`web/nginx.conf` 用 `X-Forwarded-For $remote_addr` 覆盖传递真实
   客户端 IP。若在 web 前再套一层 CDN/LB，需在那一层正确设置 `X-Forwarded-For`，
   否则限流统计的 IP 会失真。
