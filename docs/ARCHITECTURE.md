# 系统架构说明

> 适用：ACK K8s 部署 + MySQL 8 + MinIO + Hermes Agent + OpenAI 兼容 LLM

---

## 一、系统长什么样

```text
浏览器 (静态前端 / CDN)
    ↓ 读写信、发消息、轮询任务
JFO API (Miniflare Worker 运行时，K8s Pod)
    ├─ MySQL Bridge → MySQL 8：项目、对话、agent_jobs、审计
    ├─ MinIO：PDF/附件、知识网络 HTML
    ├─ /api/chat、/api/agent-jobs、/api/users/.../chat-state
    └─ /api/hermes/*（Hermes 读项目资料）
         ↓
Hermes Gateway (ACK Deployment，共 PVC /opt/data)
    ├─ /v1/chat/completions（Gateway 对话；空流时平台改走同一模型的 DashScope 流式）
    └─ /v1/runs（需要 skill / 全文 / 公开检索时的工具循环）
Skills Bridge (ACK，同 PVC) ← Admin 同步 skill 文件树
         ↓
LLM 服务（如 DashScope 千问）
```

| 组件 | 职责 |
|------|------|
| 静态前端 | 营销页 + 工作台，部署至 CDN / ACK Ingress |
| JFO API | REST API、CORS、资料检索、AI 编排 |
| MySQL 8 | 结构化数据唯一真相 |
| MinIO | 对象存储（S3 兼容） |
| Hermes | 长任务、多 skill 异步执行（ACK，非 Railway） |
| Skills Bridge | Admin 将 MySQL skill 树写入 `/opt/data/skills` |
| LLM | 轻问同步回答、embedding、降级路径 |

---

## 二、数据存储

### MySQL

- 表结构：`api-worker/schema.mysql.sql`（全量）；增量变更：`api-worker/migrations/00NN_*.sql`（手动执行）
- 初始化：`cd api-worker && npm run mysql:migrate:local`
- Worker 经 **MySQL Bridge**（Node 进程，HTTP :8790）执行 SQL

### MinIO

- 配置：`MINIO_ENDPOINT`、`MINIO_BUCKET`、`MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY`
- 对象 key 格式：`projects/{projectId}/package/...` 或 `sessions/...`
- MySQL `documents.r2_key` 列存储对象 key（历史列名，实际指向 MinIO）

---

## 三、本地 vs 生产

| 维度 | 本地开发 | ACK 生产 |
|------|----------|----------|
| API 运行时 | `npm run dev:local`（Miniflare + .dev.vars） | `npm run build:production` + `npm run start:production` |
| MySQL | 团队共享实例或本机 | K8s 外部 RDS / 集群内 MySQL |
| MinIO | 团队 MinIO 实例 | K8s 内 MinIO 或 OSS 兼容网关 |
| Hermes | Docker `:8642` | ACK Deployment（见 `deploy/ack/hermes`） |
| Skills Bridge | 可选本机 `:8791` | ACK Deployment，与 Hermes 共 PVC |
| 前端 | Vite `:5173` | 静态资源 + Ingress |

---

## 四、Hermes 读资料

Hermes 不直连 MinIO，而是通过 API 内部桥。对话与深度任务是**同一套模型**；差别是执行方式。

1. 上传时 parse/OCR → MySQL `document_parse_results` + `chunks`（项目知识状态）
2. 普通问答：走 Hermes `/v1/chat/completions`（Hermes 接的 LLM）。Worker 把已解析知识注入对话，不是每轮检索流程。空流才降级同一模型。
3. 深度任务：Hermes `/v1/runs`。知识同样先注入；不够再 `GET /api/hermes/projects/{id}/search` 或按需 `textUrl`
4. Worker 配置 `JFO_INTERNAL_KEY`；容器内用 `JFO_API_INTERNAL_BASE`（不要把公网 Tunnel 写进 Agent 指令）

---

## 五、环境变量清单

| 变量 | 用途 |
|------|------|
| `DB_DRIVER=mysql` | 固定为 mysql |
| `FILE_DRIVER=minio` | 固定为 minio |
| `MYSQL_*` | 数据库连接 |
| `MYSQL_BRIDGE_URL` | Bridge 地址（本地默认 `http://127.0.0.1:8790`） |
| `MINIO_*` | 对象存储 |
| `DASHSCOPE_API_KEY` / `DASHSCOPE_BASE_URL` | LLM |
| `HERMES_BASE_URL` / `HERMES_API_KEY` | Hermes Gateway（ACK 内网 `hermes-gateway.<ns>.svc`） |
| `SKILLS_BRIDGE_URL` / `SKILLS_BRIDGE_KEY` | Skills Bridge（ACK 内网） |
| `HERMES_K8S_NAMESPACE` / `HERMES_K8S_DEPLOYMENT` | Admin 一键滚动重启 Gateway（可选） |
| `JFO_INTERNAL_KEY` | Hermes ↔ API 资料桥 |
| `TAVILY_API_KEY` | 联网搜索（可选） |
| `ALLOWED_ORIGIN` | CORS 允许的前端 origin |

本地统一配置入口：`local.dev.secrets.env` → `scripts/generate-local-config.ps1`。
