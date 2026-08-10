# Skills Bridge（ACK 文件卷）

> **生产已迁 ACK**：清单见 [`deploy/ack/hermes/`](../deploy/ack/hermes/)、运维见 [`docs/HERMES-ACK-SETUP.md`](../docs/HERMES-ACK-SETUP.md)。旧 Railway 部署方式仅作历史参考（文末）。

管理后台以 **MySQL** 为权威源；保存后 api-worker 经本服务把整棵 skill 目录覆盖写入 Hermes 使用的 **`/opt/data/skills`** 卷。

```text
Admin UI → ACK api-worker → MySQL（权威）
                         → SKILLS_BRIDGE_URL → skills-bridge (ACK)
                                            → /opt/data/skills（与 hermes-gateway 同 PVC）
```

首次灌库：Admin「同步到 MySQL」，或本地 `npm run seed:hermes-skills` 后再「从 MySQL 同步」。

## ACK 部署要点

1. Bridge 与 Gateway **共挂** PVC `hermes-data` → `/opt/data`。
2. 镜像：`deploy/ack/hermes/Dockerfile.skills-bridge` → `jfo/skills-bridge:latest`（推送到 ACK 仓库）。
3. 环境变量：

| 变量 | 值 |
|------|-----|
| `HERMES_SKILLS_SOURCE` | `/opt/data/skills` |
| `HERMES_SKILLS_DIR` | `/opt/data/skills` |
| `SKILLS_VOLUME_MODE` | `1` |
| `SKILLS_BRIDGE_KEY` | 强随机 Bearer（必填） |
| `SKILLS_BRIDGE_PORT` | `8791` |
| `SKILLS_BRIDGE_HOST` | `0.0.0.0` |

## ACK api-worker

```text
SKILLS_BRIDGE_URL=http://skills-bridge.jfo.svc.cluster.local:8791
SKILLS_BRIDGE_KEY=<同上>
HERMES_BASE_URL=http://hermes-gateway.jfo.svc.cluster.local:8642
HERMES_API_KEY=<Hermes API_SERVER_KEY>
HERMES_K8S_NAMESPACE=jfo
HERMES_K8S_DEPLOYMENT=hermes-gateway
```

然后 `npm run build:production` 并滚动重启 API。

## 探活

```bash
curl -sS "http://skills-bridge.jfo.svc.cluster.local:8791/healthz"
curl -sS -H "Authorization: Bearer $SKILLS_BRIDGE_KEY" \
  "http://skills-bridge.jfo.svc.cluster.local:8791/v1/skills"
```

## 改完后

Skills Bridge 只改磁盘；在管理台 **重启 Hermes Gateway**，或：

```bash
kubectl -n jfo rollout restart deploy/hermes-gateway
```

## 本地调试独立 bridge

```bash
cd api-worker
set SKILLS_BRIDGE_ALLOW_INSECURE=1
set HERMES_SKILLS_SOURCE=D:\path\to\skills
set HERMES_SKILLS_DIR=D:\path\to\skills
npm run skills:bridge
```

平常本地 Admin 仍走 `npm run dev:local` 的 mysql-bridge（8790），不必起本服务。

---

## 历史：Railway（已废弃）

生产勿再新建 Railway `jfo-skills-bridge`。若仍见旧文档中的 `*.railway.internal` / `*.up.railway.app`，一律改为上表 ACK ClusterIP。
