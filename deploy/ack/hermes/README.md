# ACK：Hermes Gateway + Skills Bridge

生产路径：**不再使用 Railway**。Gateway 与 Bridge 同命名空间、共挂 PVC `/opt/data`。

## 资源

| 文件 | 说明 |
|------|------|
| `namespace.yaml` | 命名空间 `jfo`（可改） |
| `pvc.yaml` | `hermes-data`（建议 RWX / NAS） |
| `secret.example.yaml` | 密钥模板 |
| `hermes-gateway.yaml` | Deployment + Service `:8642` |
| `skills-bridge.yaml` | Deployment + Service `:8791` |
| `Dockerfile.skills-bridge` | Bridge 镜像 |
| `rbac-api-worker-restart.yaml` | api-worker 滚动重启 Gateway 的最小 RBAC |
| `kustomization.yaml` | 可选一键 apply |

## 快速部署

```bash
# 1. PVC：填好 storageClassName
# 2. Secret
kubectl -n jfo apply -f secret.yaml   # 从 secret.example.yaml 复制并改密钥

# 3. Bridge 镜像（仓库根）
docker build -f deploy/ack/hermes/Dockerfile.skills-bridge -t jfo/skills-bridge:latest .
# 推到 ACK 可用的镜像仓库后改 skills-bridge.yaml 中的 image

# 4. Apply
kubectl apply -k deploy/ack/hermes

# 5. 灌 skills（一次性）
kubectl -n jfo exec deploy/hermes-gateway -- sh -c \
  'mkdir -p /opt/data/skills && ls /opt/data/skills | head'
# 可用 hermes-railway/install-jfo-skills-railway-curl-only.sh，路径仍指向 /opt/data/skills
```

## api-worker 环境变量

```text
HERMES_BASE_URL=http://hermes-gateway.jfo.svc.cluster.local:8642
HERMES_API_KEY=<同 hermes-runtime.API_SERVER_KEY>
SKILLS_BRIDGE_URL=http://skills-bridge.jfo.svc.cluster.local:8791
SKILLS_BRIDGE_KEY=<同 hermes-runtime.SKILLS_BRIDGE_KEY>
HERMES_K8S_NAMESPACE=jfo
HERMES_K8S_DEPLOYMENT=hermes-gateway
```

api-worker Deployment 的 `serviceAccountName` 须为 `jfo-api-worker`（或改 RBAC 绑定到现有 SA）。

管理台：`POST /api/admin/skills/restart-gateway`（平台管理员）触发 `kubectl rollout restart` 等价操作。

更完整步骤见 [docs/HERMES-ACK-SETUP.md](../../../docs/HERMES-ACK-SETUP.md)。
