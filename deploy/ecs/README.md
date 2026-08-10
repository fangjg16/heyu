# ECS 部署手册（Pages + 阿里云 ECS）

前端：`https://fangjg16.github.io/heyu/`  
后端：本机 Docker Compose（见 [`docker-compose.yml`](./docker-compose.yml)）  
正式域名后置：见 [`../docs/DOMAIN-CUTOVER.md`](../../docs/DOMAIN-CUTOVER.md)

## 0. 你需要事先准备

1. 阿里云账号（实名 + 余额/按量）
2. 一台 ECS（建议 **2 vCPU / 4–8GB RAM**，Ubuntu 22.04，系统盘 ≥40GB，分配公网 IP）
3. 安全组：放行 **22**（建议仅你的 IP）、其余数据库端口**不要**对公网开放。Phase 1 用 Cloudflare Tunnel，**不必**开放 8787/80/443
4. 可用的 LLM Key（OpenAI 兼容：`BASE_URL` + `KEY` + `MODEL`）
5. GitHub 账号 `fangjg16`，仓库 `heyu` 已推送

## 1. 购买 ECS（控制台）

1. 云服务器 ECS → 创建实例
2. 镜像：Ubuntu 22.04 LTS
3. 实例规格：ecs.u1-c1m2.large 或同级（约 2C4G）；跑 Hermes 吃紧则上 4C8G
4. 网络：分配公网 IPv4
5. 登录凭证：自定义密码或 SSH 密钥（请自行保管）
6. 创建后记下 **公网 IP**

## 2. 安全组

入方向建议：

| 端口 | 授权对象 | 用途 |
|------|----------|------|
| 22/tcp | 你的公网 IP/32 | SSH |
| （可选）80/443 | 0.0.0.0/0 | 仅在启用 Caddy + 正式域名后需要 |

不要对公网开放：3306、9000、8642、8790、8787（Phase 1 经 Tunnel 出网）。

## 3. SSH 安装 Docker

```bash
ssh root@<ECS公网IP>
# 或 ubuntu@...

sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# 重新登录后再用 docker
docker version
docker compose version
```

## 4. 拉取代码并配置密钥

```bash
git clone https://github.com/fangjg16/heyu.git
cd heyu
cp deploy/ecs/.env.example deploy/ecs/.env
nano deploy/ecs/.env   # 填入 LLM / MySQL / MinIO / HERMES / JFO_INTERNAL_KEY
```

`HERMES_API_KEY` 与 `JFO_INTERNAL_KEY` 各至少 16 位随机 ASCII。  
`JFO_API_PUBLIC_BASE` 先留占位，等 Tunnel URL 出来再改。

## 5. 启动全栈

```bash
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env up -d --build
```

查看 Tunnel 公网 HTTPS 地址：

```bash
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env logs -f cloudflared
# 找到类似 https://xxxx.trycloudflare.com 的一行
```

把该 URL 写入 `deploy/ecs/.env`：

```bash
JFO_API_PUBLIC_BASE=https://xxxx.trycloudflare.com
```

然后重启 API（刷新环境变量）：

```bash
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env up -d jfo-api
```

## 6. 数据库迁移

```bash
chmod +x deploy/ecs/scripts/migrate.sh
./deploy/ecs/scripts/migrate.sh
```

自检：

```bash
curl -sS "$JFO_API_PUBLIC_BASE/api/health"
# 期望 ok: true，dbDriver: mysql，fileDriver: minio
```

## 7. 接通 GitHub Pages

1. 仓库 **Settings → Pages → Source = GitHub Actions**
2. **Settings → Secrets and variables → Actions** 新增：
   - Name: `VITE_AI_CHAT_ENDPOINT`
   - Value: `https://xxxx.trycloudflare.com/api/chat`
3. 推送 `main` 或手动 **Actions → Deploy GitHub Pages → Run workflow**
4. 打开：https://fangjg16.github.io/heyu/

登录使用前端内置演示账号（如 `JimmyHuang` / `jfo2026`）。**上线后请立即改密或停用演示账号策略。**

## 8. 常见问题

| 现象 | 处理 |
|------|------|
| Pages 能开但登录/对话失败 | 检查 `VITE_AI_CHAT_ENDPOINT`、Tunnel 是否仍有效、CORS `ALLOWED_ORIGIN` |
| `/api/health` 里 db 失败 | `migrate.sh`；看 `mysql-bridge` 日志 |
| 上传失败 | `minio-init` 是否成功；`MINIO_*` 与 bucket 名 |
| Hermes 401 | `HERMES_API_KEY` 与容器 `API_SERVER_KEY` 一致 |
| Tunnel URL 变了 | 更新 `.env` 的 `JFO_API_PUBLIC_BASE` + GitHub Secret 并重新部署 Pages |
| OOM | 升配 ECS 内存；`docker stats` |

## 9. 日常命令

```bash
# 状态
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env ps

# 日志
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env logs -f jfo-api

# 更新代码后
git pull
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env up -d --build
```
