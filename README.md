# 合域 · 联合家办平台（heyu）

多家族联合投资决策辅助平台。当前仓库前端为 **侧栏工作台**（总览 / 项目库 / 对话），与测试站 `heyu-test` 同代 UI。

| | URL |
|--|--|
| 前端（Pages） | https://fangjg16.github.io/heyu/ |
| 源码 | https://github.com/fangjg16/heyu |
| 参考测试站 | https://heyu-test.iyuhu.com/family-office-platform/ |

> **安全**：勿提交 `local.dev.secrets.env`、`deploy/ecs/.env`、`api-worker/.dev.vars`。

## 公网上线

1. **[deploy/ecs/README.md](./deploy/ecs/README.md)** — ECS + Docker Compose + Tunnel  
2. GitHub Secret `VITE_AI_CHAT_ENDPOINT` = `{API}/api/chat` 后 Deploy Pages  
3. 验收：[docs/ACCEPTANCE-CHECKLIST.md](./docs/ACCEPTANCE-CHECKLIST.md)  
4. 域名切流（后置）：[docs/DOMAIN-CUTOVER.md](./docs/DOMAIN-CUTOVER.md)

## 本地开发

```powershell
copy local.dev.secrets.env.example local.dev.secrets.env
# 填写密钥后
powershell -ExecutionPolicy Bypass -File scripts/generate-local-config.ps1
npm install
npm run dev
```

打开 http://localhost:5173/heyu/  

全栈见 [docs/LOCAL-DEV-WINDOWS.md](./docs/LOCAL-DEV-WINDOWS.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [deploy/ecs/README.md](./deploy/ecs/README.md) | ECS 部署 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | 架构 |
| [docs/LOCAL-DEV-WINDOWS.md](./docs/LOCAL-DEV-WINDOWS.md) | Windows 本地 |
| [hermes-railway/README.md](./hermes-railway/README.md) | Hermes |
