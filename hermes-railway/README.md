# Hermes Agent 部署（ACK / Docker）

本目录是 **Hermes 配置与 skills**，不是可执行代码。生产环境部署于 **ACK K8s**（清单 [`deploy/ack/hermes/`](../deploy/ack/hermes/)，说明 [`docs/HERMES-ACK-SETUP.md`](../docs/HERMES-ACK-SETUP.md)）；本地用 Docker Compose。**生产不再使用 Railway。**

## Skills（GitHub Raw 安装）

合域 **v2.8** 的 16 个 skill + 家办桥接 `jfo-r2-materials` 已放在 `hermes-railway/skills/`。  
`knowledge-base-generation` 为**整目录**（含 `assets/kb-template.html`、`KB-CONFIG`、`assets/components.html`、`references/kb-schema.md` 等）。  
**ACK / 容器灌装**：可用 `install-jfo-skills-railway-curl-only.sh`（curl-only v2.8，脚本名历史遗留），skills 根路径 `/opt/data/skills`（Hermes Gateway 实际读取路径，**不是** `/opt/data/.hermes/skills`）。

**安装后自检（三条须全部通过）：**

```bash
test -f /opt/data/skills/knowledge-base-generation/references/kb-schema.md
test -f /opt/data/skills/knowledge-base-generation/assets/kb-template.html
grep -q revealAnchor /opt/data/skills/knowledge-base-generation/assets/kb-template.html
```

`/opt/data/.hermes/skills` 为历史误装路径，**不再作为运行路径**；见 [README_DEPRECATED-skills-path.md](./README_DEPRECATED-skills-path.md)。

详见 **[INSTALL-SKILLS-FROM-GITHUB.md](./INSTALL-SKILLS-FROM-GITHUB.md)**、`docs/HERMES-RAILWAY-SSH-SETUP.md`；SOUL 见 **[SOUL-JFO-KB.md](./SOUL-JFO-KB.md)**。

勿用 `install-jfo-skills-v28.sh` 在 Railway SSH 非交互环境（会卡在 `Pick a category`）。勿再引用 v2.7 `reference/skills_reference.md`。

**运行时模板路径**：`knowledge-base-generation/assets/kb-template.html`（根目录 `kb-template.html` 仅为 deprecated 占位，勿作入口）。

`reference/` 目录为 v2.7 历史归档，见 `reference/DEPRECATED.md`，**不得**引入运行链路。

`jfo-r2-materials` 是 Hermes 版「项目资料读取层」：先 manifest + 当前 KB，再**按任务按需**拉 textUrl（非机械全文）。Worker 指令与 SOUL 已对齐。

## 1. ACK 部署

见 **[`docs/HERMES-ACK-SETUP.md`](../docs/HERMES-ACK-SETUP.md)** 与 **`deploy/ack/hermes/`**（Gateway + Skills Bridge + 共挂 PVC）。镜像启动命令为 `gateway run`（参见 [Hermes Agent](https://github.com/NousResearch/hermes-agent)）。

本地：`docker compose -f docker-compose.local.yml up -d`。

## 2. 环境变量（千问）

在 ACK Secret / Deployment env 中添加（值来自阿里云 DashScope）：

```bash
# Hermes API 服务（给 JFO API 调用）
API_SERVER_ENABLED=true
API_SERVER_KEY=请换成随机长密码_与Worker的HERMES_API_KEY相同

# 千问 / DashScope（标准按量 Key）
DASHSCOPE_API_KEY=sk-xxxxxxxx

# 若 Hermes 使用 OpenAI 兼容 custom provider，常见写法：
# MODEL_PROVIDER=custom
# OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
# OPENAI_API_KEY=同上 DASHSCOPE_API_KEY
# MODEL_DEFAULT=qwen3.7-plus
```

**注意：** 国际站 / 国内站 base_url 不同。Coding Plan 与标准 Key 不能混用 endpoint。  
见：[Hermes Qwen Cloud 文档](https://docs.qwencloud.com/token-plan/tools/hermes-agent)、[Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers)。

安装 Hermes 后可在容器里执行：

```bash
hermes config set model.provider custom
hermes config set model.base_url https://dashscope.aliyuncs.com/compatible-mode/v1
hermes config set model.api_key $DASHSCOPE_API_KEY
hermes config set model.default qwen3.7-plus
```

（国际用户可能用 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`，以控制台说明为准。）

## 3. 启动与公网地址

启动：`hermes gateway`（默认监听 `8642`）。

Worker 里配置（集群内优先；**不要**加 `/v1` 后缀，Worker 会按实现拼接路径）：

```bash
HERMES_BASE_URL=http://hermes-gateway.jfo.svc.cluster.local:8642
HERMES_API_KEY=与 API_SERVER_KEY 相同
HERMES_MODEL=qwen3.7-plus
SKILLS_BRIDGE_URL=http://skills-bridge.jfo.svc.cluster.local:8791
SKILLS_BRIDGE_KEY=与 Bridge 相同
```

## 4. 自测

```bash
curl "https://你的railway域名/v1/models" \
  -H "Authorization: Bearer 你的API_SERVER_KEY"
```

应返回模型列表或 200 JSON。

再测对话：

```bash
curl "https://你的railway域名/v1/chat/completions" \
  -H "Authorization: Bearer 你的API_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.7-plus","messages":[{"role":"user","content":"你好"}],"stream":false}'
```



## 5. 安全建议

- 不要将 `API_SERVER_KEY` / `DASHSCOPE_API_KEY` 提交到 GitHub。
- 生产环境限制 Hermes 工具集（避免对公网开放终端工具）。
- 仅允许 Cloudflare Worker 的 IP 或共享密钥访问（Railway 可再加自定义 header 校验）。

