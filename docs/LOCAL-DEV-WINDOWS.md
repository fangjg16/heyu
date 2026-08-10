# Windows 本地全栈开发指南

> **目标**：API + MySQL + MinIO + Hermes 全部在本机/内网可达；仅 **LLM API** 与 **Tavily** 使用云端授权。

---

## 架构

```text
浏览器 :5173
    ↓
API  Miniflare HTTP :8787
    ├─ MySQL Bridge :8790 → MySQL 8
    ├─ MinIO（S3 API）
    ├─ LLM      OpenAI 兼容 endpoint（云端）
    ├─ Tavily   联网搜索（云端）
    └─ Hermes   Docker :8642（本机）
           └─ 读资料 → host.docker.internal:8787/api/hermes/…
```

---

## 前置条件

| 软件 | 用途 |
|------|------|
| Node.js 18+ | 前端 + API |
| Docker Desktop | 本地 Hermes Gateway |
| MySQL 8 | 可访问的实例（团队共享或本机） |
| MinIO | 可访问的 S3 兼容存储 |
| 密钥 | 见仓库根目录 `local.dev.secrets.env` |

---

## 第一次使用（三步）

### 1. 确认本地配置

仓库已包含 `local.dev.secrets.env`（及生成的 `api-worker/.dev.vars`、`.env.local`、`hermes-railway/.env.docker.local`）。  
若修改了 `local.dev.secrets.env`，重新生成各服务配置：

```powershell
powershell -File scripts/generate-local-config.ps1
```

必填项：`LLM_API_*`、`TAVILY_API_KEY`、`HERMES_API_KEY`（≥16 字符）、`JFO_INTERNAL_KEY`（≥16 字符）、`MYSQL_*`、`MINIO_*`。

### 2. 一键初始化

双击 **`本地初始化.bat`**，或：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local-windows.ps1
```

### 3. 日常启动

双击 **`启动本地全栈.bat`**（Hermes 容器 + API + 前端）。

浏览器：**http://localhost:5173/heyu/app/login**  
账号：`jimmyhuang` / `jfo2026`（登录名大小写不敏感；密码在 MySQL `workspace_users`，由 `npm run seed:workspace-users` 写入）

登录成功后前端持有 Bearer token；API 鉴权依赖该 token，不再信任随意伪造的 `userId`。

平台管理员（如 `candiceguo` / `jfo2026`）可打开 **管理中枢**（`/app/admin`）：

- **用户管理**：新建/编辑/停用、重置密码；项目可见范围在项目「权限管理」中加人
- **Skills 管理**：MySQL 为权威（表 `hermes_skills` / `hermes_skill_files`）。迁移后执行 `npm run seed:hermes-skills`（api-worker）或 Admin「同步到 MySQL」；保存后自动经 Bridge 整树落到本地 / ACK PVC。生产见 `docs/HERMES-ACK-SETUP.md`；协议见 `hermes-railway/SKILLS-BRIDGE.md`。

更改 `api-worker/src` 后请 `npm run build:production` 并重启 API（并重启 Bridge，以便加载 skills 路由）。

---

## 手动命令（排错用）

```powershell
# 改密钥后重新生成配置
powershell -File scripts/generate-local-config.ps1

# API（含 MySQL Bridge）
cd api-worker
npm run dev:local

# 前端
cd ..
npm run dev

# Hermes
cd hermes-railway
docker compose -f docker-compose.local.yml up -d
```

管理台「重启 Hermes Gateway」在本地默认执行 `docker restart jfo-hermes-local`（需 Docker Desktop；`JFO_INTERNAL_KEY` 已在 `local.dev.secrets.env`）。无需配置 K8s。

---

## 自检

```powershell
curl http://127.0.0.1:8642/health
curl http://127.0.0.1:8787/api/health
```

期望 `/api/health` 返回 `dbDriver: mysql`、`fileDriver: minio`、`ok: true`。

---

## 常见问题

| 现象 | 处理 |
|------|------|
| CORS 403 | `api-worker/.dev.vars` 中 `ALLOWED_ORIGIN=http://localhost:5173` |
| Hermes 401 | `HERMES_API_KEY` 与容器 `API_SERVER_KEY` 一致 |
| 深度任务无资料 | Hermes 容器内用 `host.docker.internal:8787` |
| 8787 占用 | 关闭占用进程后重启 `npm run dev:local` |
| 创建项目失败 | 执行 `cd api-worker && npm run mysql:migrate:local` |
| 无法登录 | 执行 `npm run seed:workspace-users`；确认 API 已 `build:production` 且含鉴权表 |

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `local.dev.secrets.env` | 本地密钥与连接（Git 管控） |
| `scripts/generate-local-config.ps1` | 从 secrets 生成 `.dev.vars` / `.env.local` / `.env.docker.local` |
| `api-worker/.dev.vars` | API 运行时配置 |
| `.env.local` | 前端 Vite 配置 |
| `hermes-railway/.env.docker.local` | Hermes Docker 配置 |
