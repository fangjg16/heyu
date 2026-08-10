# Hermes @ ACK：Gateway + Skills Bridge

生产环境：**Hermes Gateway 与 Skills Bridge 均部署在 ACK**，与 api-worker 同集群；**不再使用 Railway**。

清单与 RBAC：[`deploy/ack/hermes/`](../deploy/ack/hermes/)。

## 架构

```text
Admin UI → api-worker (ACK)
              ├─ MySQL（skill 权威）
              ├─ SKILLS_BRIDGE_URL → skills-bridge.jfo.svc:8791 → PVC /opt/data/skills
              └─ HERMES_BASE_URL  → hermes-gateway.jfo.svc:8642（同 PVC）
管理台「重启 Gateway」→ api-worker 经 K8s API patch Deployment（需 HERMES_K8S_* + RBAC）
```

## api-worker 环境变量

```text
HERMES_BASE_URL=http://hermes-gateway.jfo.svc.cluster.local:8642
HERMES_API_KEY=<hermes-runtime.API_SERVER_KEY>
SKILLS_BRIDGE_URL=http://skills-bridge.jfo.svc.cluster.local:8791
SKILLS_BRIDGE_KEY=<hermes-runtime.SKILLS_BRIDGE_KEY>
HERMES_K8S_NAMESPACE=jfo
HERMES_K8S_DEPLOYMENT=hermes-gateway
```

`serviceAccountName` 绑定 [`rbac-api-worker-restart.yaml`](../deploy/ack/hermes/rbac-api-worker-restart.yaml) 中的 SA（默认可补丁 `hermes-gateway`）。

一键重启：本地默认 `docker restart jfo-hermes-local`（`HERMES_RESTART_MODE=docker`）；ACK 再配 `HERMES_K8S_*` + ServiceAccount。链路：Worker → `http-server` `/__jfo/internal/restart-hermes-gateway`（`JFO_INTERNAL_KEY`）。

## 迁移自 Railway（一次性）

1. ACK 按 `deploy/ack/hermes` 起 Gateway + Bridge + PVC。
2. 将 skills 灌入 `/opt/data/skills`（可用 `hermes-railway/install-jfo-skills-railway-curl-only.sh`，路径仍为 `/opt/data/skills`）。
3. 改 api-worker 环境（上表），滚动重启 API Pod。
4. 验收：`/health`、`SKILLS_BRIDGE` `/healthz`、Admin Skills 列表与同步。
5. 下线 Railway 上的 `hermes-agent` / `jfo-skills-bridge`；保留旧卷备份一段时间。

## 改 skill 后

同步只写 PVC；**在管理台点「重启 Hermes Gateway」**（或 `kubectl -n jfo rollout restart deploy/hermes-gateway`）。

## 本地

仍用 Docker Compose（[`hermes-railway/docker-compose.local.yml`](../hermes-railway/docker-compose.local.yml)），无需 K8s：

```powershell
cd hermes-railway
docker compose -f docker-compose.local.yml restart hermes
```

历史 Railway 操作见 [`HERMES-RAILWAY-SSH-SETUP.md`](./HERMES-RAILWAY-SSH-SETUP.md)（已废弃）。
