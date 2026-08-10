# ECS：Nathan 团队旧栈归档 + 与新 heyu 并存

适用机器：`47.243.83.205`（`heyu.hk` 已指向此 ECS）。  
目标：**旧 `/fop/biz` 只作参考、永不对外**；**日常与公网流量只走新 `heyu`（MySQL + api-worker + Hermes）**。

旧栈特征（Nathan 时期）：Compose 项目名 `biz`，镜像 `fop-web` / `fop-api`，依赖 **Postgres + Redis**，nginx 反代 `127.0.0.1:18080`。  
新栈特征：仓库 `fangjg16/heyu`，Compose 项目名 `heyu-jfo`，**MySQL + MinIO + mysql-bridge + jfo-api:8787 + Hermes + cloudflared**。两套技术路线不同，**不要**把 Pages 前端接到旧 `fop-api`。

## 0. 快照（必做）

阿里云控制台 → ECS → 该实例 → **创建快照**（系统盘）。完成后再改端口 / 动 nginx。

## 1. 一键归档旧栈（改端口 + 打标）

在 ECS 上（建议 root）——**先 clone 现行仓库再跑脚本**（勿依赖尚未合并的 raw 链接）：

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/fangjg16/heyu.git
# 若 PR 尚未合入 main，临时用功能分支：
# cd /opt/heyu && git fetch origin && git checkout cursor/ecs-compose-bringup-9b8c

bash /opt/heyu/deploy/ecs/scripts/archive-nathan-fop.sh
```

脚本会：

1. 把 `/fop/biz` 挪到 `/fop/nathan-team-archive/biz`（保留全部代码与 compose）
2. 写入 `ARCHIVE.md` / `NATHAN-TEAM.txt` 标记来源与「勿对外」
3. Compose **project name** 改为 `nathan-archive`
4. 宿主机端口平移到 **28xxx**（默认 `18080→28080`），避免占用「生产口感」端口
5. `docker compose up -d` 以新端口拉起（仅本机可访问，供对照代码）
6. 备份并改写 `/etc/nginx/conf.d/heyu.hk.conf`：根路径 **302 → GitHub Pages**，不再反代旧 `fop-web`

完成后自检：

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}' | egrep 'nathan|biz|heyu|NAMES'
curl -sI http://127.0.0.1:28080/ | head -5    # 旧前端仅本机高位端口
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://heyu.hk/ | head -10           # 应跳转 Pages，而不是旧站
```

若脚本探测不到 compose 文件或端口写法特殊，它会停在「已挪目录 + 已写标记」，并打印需你手工改的端口清单——按提示改 `ports:` 后：

```bash
cd /fop/nathan-team-archive/biz
docker compose -p nathan-archive up -d
```

## 2. 部署现行 heyu（对外唯一后端）

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/fangjg16/heyu.git   # 已有则 git pull
cd /opt/heyu
cp deploy/ecs/.env.example deploy/ecs/.env
nano deploy/ecs/.env   # LLM / MySQL / MinIO / HERMES / JFO_INTERNAL_KEY

docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env up -d --build
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env logs -f cloudflared
# 复制 https://xxxx.trycloudflare.com → 写入 JFO_API_PUBLIC_BASE 后：
docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env up -d jfo-api hermes
chmod +x deploy/ecs/scripts/migrate.sh
./deploy/ecs/scripts/migrate.sh
curl -sS "$JFO_API_PUBLIC_BASE/api/health"
```

新栈默认**不**把 3306/8787 映射到宿主机，与 Nathan 归档容器网络隔离，可安全并存。

## 3. 接通 Pages

GitHub → `heyu` → Secrets → Actions：

- `VITE_AI_CHAT_ENDPOINT` = `https://xxxx.trycloudflare.com/api/chat`
- （若工作流需要）`VITE_ENABLE_LIVE_CHAT` = `1`

然后 Redeploy Pages。前端：https://fangjg16.github.io/heyu/

## 4. 日常约定

| 路径 / 名称 | 用途 |
|-------------|------|
| `/fop/nathan-team-archive/` | Nathan 时期参考代码与运行态（高位端口） |
| `/opt/heyu/` | **现行**产品与部署 |
| `heyu.hk` | 跳转 Pages（或日后反代新 API），**禁止**再指旧 `fop-web` |
| Cloudflare Tunnel / 日后 Caddy | 新 API 公网入口 |

停掉归档（省 CPU，目录仍保留）：

```bash
cd /fop/nathan-team-archive/biz
docker compose -p nathan-archive stop
# 需要对照时再 start
```

**不要**对归档执行 `docker compose down -v`，除非快照已有且你确定不再需要旧数据卷。

## 5. 端口对照（默认）

| 服务 | Nathan 原宿主机口 | 归档后 | 新 heyu |
|------|-------------------|--------|---------|
| 旧 Web | 18080 | **28080**（仅 127.0.0.1 建议） | — |
| 旧 API 若曾发布 | 8080 等 | **28080+偏移**（脚本探测） | — |
| jfo-api | — | — | 容器内 8787，经 Tunnel |
| MySQL | — | — | 仅 compose 网络 |
| nginx 80/443 | heyu.hk→18080 | heyu.hk→Pages 302 | 保持证书，日后可加 `/api` |
