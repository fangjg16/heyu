# JFO API

家办平台 REST API，运行于 Miniflare Worker 运行时（ACK K8s / 本地开发）。

## 端点概览

- `GET /api/health` — 健康检查
- `GET/POST /api/projects` — 项目 CRUD
- `GET/POST /api/projects/:id/files` — 资料上传/列表
- `POST /api/chat` — 对话（轻问 SSE / 深度 async）
- `GET /api/agent-jobs/:id` — 深度任务轮询
- `GET/PUT /api/users/:id/chat-state` — 对话云端同步
- `GET /api/hermes/*` — Hermes 读资料（内部鉴权）

## 本地开发

```powershell
# 根目录填写 local.dev.secrets.env 后
powershell -File scripts/generate-local-config.ps1

cd api-worker
npm install
npm run build:production   # 首次或改 src 后需打包（dev:local 也会自动检测）
npm run mysql:migrate:local
npm run seed:workspace-users   # 工作区演示账号
npm run dev:local   # MySQL Bridge :8790 + API :8787
```

登录走 `POST /api/auth/login`（Bearer session）。演示账号见种子脚本（如 `jimmyhuang` / `jfo2026`，大小写不敏感），密码仅以哈希存库。

平台管理员可用：

- `/api/admin/workspace-users`（及 password、project-memberships）— 用户管理
- `GET /api/admin/skills`、`POST /api/admin/skills`、`POST /api/admin/skills/sync` — 列表 / 新建 / 同步 skills
- `GET|PUT|DELETE /api/admin/skills/:name` — 读写或删除 skill 的 `SKILL.md`

**权威源为 MySQL**（`hermes_skills` / `hermes_skill_files`）：Admin CRUD 写库后自动经 Skills Bridge 整树覆盖到卷。对话意图 ↔ skill 由代码 [`skill-intent-map.ts`](src/skill-intent-map.ts) 固定，后台只读展示。

- 迁移：`0004`、`0006`（`intent` 列可保留但不做后台编辑）、`0007`（`description` 作用简述）
- 桥接：`SKILLS_BRIDGE_URL`（ACK 内网）→ 否则 `MYSQL_BRIDGE_URL`；见 `docs/HERMES-ACK-SETUP.md`
- Gateway 重启（可选）：`HERMES_K8S_NAMESPACE` + `HERMES_K8S_DEPLOYMENT` → `POST /api/admin/skills/restart-gateway`

前端入口：工作区「管理中枢」。

## 生产（ACK K8s）

```powershell
npm run build:production
npm run start:production   # 需注入 MYSQL_*、MINIO_*、LLM/Hermes、SKILLS_BRIDGE_* 等环境变量
```

### 长请求超时（章节 `/generate`）

`http-server.mjs` 默认将入站 `requestTimeout` 设为 **30 分钟**（`JFO_HTTP_REQUEST_TIMEOUT_MS=1800000`；`0`=不限制）。

若前面还有 Ingress / Nginx / SLB，也必须加长，否则浏览器仍会在约 1–3 分钟出现 `Failed to fetch`，而 Worker 可能已写库：

```yaml
# Nginx Ingress 示例
metadata:
  annotations:
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "1800"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "1800"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "1800"
```

## 数据库迁移

```powershell
npm run mysql:migrate:local
npm run seed:workspace-users
```

- **新库初始化**：`schema.mysql.sql`（含表/字段 COMMENT）
- **已有库增量**：`migrations/*.sql` 会在 migrate 时按文件名排序自动执行（如 `0002_workspace_auth.sql`）
- **用户种子**：`seed:workspace-users` 写入演示账号；Guest 可见项目请在项目「权限管理」中加入成员

## 存储

- **MySQL 8**：结构化数据（经 MySQL Bridge）+ 用户鉴权
- **MinIO**：对象存储（S3 兼容 API）

配置见根目录 `local.dev.secrets.env`（本地）或 K8s Secret（生产）。
