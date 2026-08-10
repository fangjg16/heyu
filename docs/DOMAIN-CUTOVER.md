# 正式域名切流（后置）

前期使用 GitHub Pages + Cloudflare Tunnel。域名（例如 `heyu.hk`）确认可用后，按本节切换，**无需重装整套 Compose**。

## 前提

- 你拥有域名的 DNS 管理权（公司域名需确认授权）
- ECS 安全组放行 **80/443**
- 已能用 Tunnel 地址正常登录与对话

## 步骤

1. **DNS**  
   添加 A 记录：`api` → ECS 公网 IP（或你选择的主机名）。

2. **启用 Caddy**  
   - 复制 [`deploy/ecs/Caddyfile.example`](../deploy/ecs/Caddyfile.example) 为 `deploy/ecs/Caddyfile`  
   - 把 `api.example.com` 改成你的主机（如 `api.heyu.hk`）  
   - 在 [`docker-compose.yml`](../deploy/ecs/docker-compose.yml) 中取消 `caddy` 服务与 volume 注释  
   - `docker compose ... up -d caddy`

3. **环境变量**（`deploy/ecs/.env`）  
   - `JFO_API_PUBLIC_BASE=https://api.heyu.hk`（按实际）  
   - `ALLOWED_ORIGIN=https://fangjg16.github.io`（前端仍在 Pages 时可不变）  
   - 重启：`docker compose ... up -d jfo-api hermes`

4. **GitHub Actions Secret**  
   - `VITE_AI_CHAT_ENDPOINT=https://api.heyu.hk/api/chat`  
   - 重新跑 Pages workflow

5. **下线 Tunnel（可选）**  
   - `docker compose ... stop cloudflared`  
   - 确认仅走 Caddy HTTPS

6. **验收**  
   - `curl -sS https://api.heyu.hk/api/health`  
   - Pages 登录 / 上传 / 对话 / 管理中枢

## 可选：前端也挂到自定义域名

可将 `www`/`@` 指到 GitHub Pages（仓库 Settings → Pages → Custom domain），与 API 主机分开；需另配 DNS 与证书说明，不在 Phase 1 范围。
