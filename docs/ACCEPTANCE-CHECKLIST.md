# 联调验收清单（临时 Tunnel 地址）

在 ECS 上完成 Compose 启动与迁移后，按序勾选。

## A. 基础设施

- [ ] `docker compose ... ps` 中 `mysql` / `mysql-bridge` / `minio` / `jfo-api` / `hermes` / `cloudflared` 为 running（`minio-init` 为 exited 0）
- [ ] `curl -sS "$JFO_API_PUBLIC_BASE/api/health"` 返回 JSON：`ok: true`，`dbDriver: "mysql"`，`fileDriver: "minio"`
- [ ] Tunnel URL 已写入 `deploy/ecs/.env` 的 `JFO_API_PUBLIC_BASE` 并重启过 `jfo-api`

## B. 前端 Pages

- [ ] https://fangjg16.github.io/heyu/ 可打开
- [ ] GitHub Secret `VITE_AI_CHAT_ENDPOINT` = `$JFO_API_PUBLIC_BASE/api/chat`
- [ ] Actions「Deploy GitHub Pages」成功

## C. 工作台功能

- [ ] 登录（演示账号，如 JimmyHuang / jfo2026）成功
- [ ] 创建项目成功
- [ ] 上传资料成功（写入 MinIO）
- [ ] 轻问对话 `/api/chat` 返回 200 且有流式/回复
- [ ] Hermes 深度任务可创建（若 LLM Key 有效）
- [ ] 管理员账号可打开 `/heyu/app/admin`（CandiceGuo）

## D. 安全（务必做）

- [ ] 修改或停用演示密码策略
- [ ] 确认 `local.dev.secrets.env` / `deploy/ecs/.env` 未进入 Git
- [ ] 轮换曾出现在本机/交接文档中的旧 LLM / DB / MinIO Key（若仍有效且不应继续使用）

## 快速命令

```bash
export JFO_API_PUBLIC_BASE=https://xxxx.trycloudflare.com
curl -sS "$JFO_API_PUBLIC_BASE/api/health" | head
curl -sS -o /dev/null -w "%{http_code}\n" -X OPTIONS "$JFO_API_PUBLIC_BASE/api/health" \
  -H "Origin: https://fangjg16.github.io" \
  -H "Access-Control-Request-Method: GET"
```
