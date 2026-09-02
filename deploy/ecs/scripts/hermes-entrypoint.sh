#!/usr/bin/env bash
# Configure Hermes for DashScope/OpenAI-compatible custom endpoint, then start gateway.
# Newer Hermes builds read model/base_url from $HERMES_HOME/config.yaml (not only env).
set -euo pipefail

DATA="${HERMES_HOME:-/opt/data}"
mkdir -p "$DATA"

BASE="${OPENAI_API_BASE:-${OPENAI_BASE_URL:-${LLM_API_BASE_URL:-https://dashscope.aliyuncs.com/compatible-mode/v1}}}"
BASE="${BASE%/}"
KEY="${OPENAI_API_KEY:-${DASHSCOPE_API_KEY:-${LLM_API_KEY:-}}}"
MODEL="${MODEL_DEFAULT:-${LLM_MODEL:-qwen3.7-plus}}"

if [[ -z "$KEY" ]]; then
  echo "[hermes-entrypoint] ERROR: OPENAI_API_KEY / DASHSCOPE_API_KEY / LLM_API_KEY is empty" >&2
  exit 1
fi

# Secrets file (Hermes reads API keys from here)
cat >"${DATA}/.env" <<EOF
OPENAI_API_KEY=${KEY}
DASHSCOPE_API_KEY=${KEY}
OPENAI_API_BASE=${BASE}
OPENAI_BASE_URL=${BASE}
EOF

# Model + auxiliary must use custom/main — otherwise title/deep runs fall back to OpenRouter/Nous → 401
cat >"${DATA}/config.yaml" <<EOF
model:
  provider: custom
  base_url: ${BASE}
  default: ${MODEL}
  api_key: ${KEY}

auxiliary:
  title_generation:
    provider: main
  vision:
    provider: main
  web_extract:
    provider: main
  compression:
    provider: main
  session_search:
    provider: main
  skills_hub:
    provider: main
  mcp:
    provider: main
  flush_memories:
    provider: main
  approval:
    provider: main
EOF

echo "[hermes-entrypoint] wrote ${DATA}/config.yaml (provider=custom model=${MODEL})"
echo "[hermes-entrypoint] skills dir: ${HERMES_SKILLS_DIR:-/opt/data/skills}"

export HERMES_HOME="$DATA"
export OPENAI_API_KEY="$KEY"
export OPENAI_API_BASE="$BASE"
export OPENAI_BASE_URL="$BASE"
export DASHSCOPE_API_KEY="$KEY"
export MODEL_DEFAULT="$MODEL"
# 官方镜像里 cwd/PATH 上的 gateway 是目录，不能 exec；须走 hermes CLI。
# 自定义 entrypoint 会绕过 s6，以 root 跑时需允许。
export HERMES_ALLOW_ROOT_GATEWAY="${HERMES_ALLOW_ROOT_GATEWAY:-1}"

echo "[hermes-entrypoint] starting hermes gateway run"

if [[ -x /opt/hermes/bin/hermes ]]; then
  exec /opt/hermes/bin/hermes gateway run
fi

hermes_bin="$(command -v hermes 2>/dev/null || true)"
if [[ -n "$hermes_bin" && -f "$hermes_bin" && -x "$hermes_bin" ]]; then
  exec "$hermes_bin" gateway run
fi

echo "[hermes-entrypoint] ERROR: hermes CLI not found (do not exec gateway — it is a directory)" >&2
command -v gateway >&2 || true
ls -ld gateway /opt/hermes/gateway /usr/local/bin/hermes /opt/hermes/bin/hermes 2>/dev/null >&2 || true
exit 1
