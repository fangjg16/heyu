#!/usr/bin/env bash
# Archive Nathan-era /fop/biz stack: label, remap host ports, free heyu.hk for new heyu.
# Run on the ECS as root (or with sudo). Idempotent where possible.
set -euo pipefail

SRC_DIR="${NATHAN_SRC_DIR:-/fop/biz}"
ARCHIVE_ROOT="${NATHAN_ARCHIVE_ROOT:-/fop/nathan-team-archive}"
DEST_DIR="${ARCHIVE_ROOT}/biz"
PROJECT_NAME="${NATHAN_COMPOSE_PROJECT:-nathan-archive}"
OLD_WEB_PORT="${NATHAN_OLD_WEB_PORT:-18080}"
NEW_WEB_PORT="${NATHAN_NEW_WEB_PORT:-28080}"
NGINX_CONF="${NATHAN_NGINX_CONF:-/etc/nginx/conf.d/heyu.hk.conf}"
PAGES_URL="${HEYU_PAGES_URL:-https://fangjg16.github.io/heyu/}"
BIND_LOCAL="${NATHAN_BIND_LOCAL:-127.0.0.1}"

log() { printf '[nathan-archive] %s\n' "$*"; }
die() { printf '[nathan-archive] ERROR: %s\n' "$*" >&2; exit 1; }

need_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "请用 root 运行（或 sudo bash $0）"
  fi
}

find_compose_file() {
  local d="$1"
  if [[ -f "$d/docker-compose.yml" ]]; then echo "$d/docker-compose.yml"; return; fi
  if [[ -f "$d/docker-compose.yaml" ]]; then echo "$d/docker-compose.yaml"; return; fi
  if [[ -f "$d/compose.yml" ]]; then echo "$d/compose.yml"; return; fi
  if [[ -f "$d/compose.yaml" ]]; then echo "$d/compose.yaml"; return; fi
  return 1
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    die "未找到 docker compose / docker-compose"
  fi
}

write_markers() {
  local root="$1"
  mkdir -p "$root"
  cat >"${root}/NATHAN-TEAM.txt" <<'EOF'
Nathan 团队时期（公司 FOP / biz 栈）归档
========================================
来源目录原为 /fop/biz（Compose 项目名多为 biz）。
镜像常见：fop-web、fop-api、agent-gateway；依赖 Postgres + Redis。
与现行 fangjg16/heyu（MySQL + api-worker + Hermes）不是同一套后端。

约定：
- 仅供架构/代码借鉴，不对外提供服务
- 宿主机端口已挪到 28xxx 高位；勿再把 nginx / 域名指回此处
- 生产与公网流量只使用 /opt/heyu + Cloudflare Tunnel（或日后 Caddy）
EOF

  cat >"${root}/ARCHIVE.md" <<EOF
# Nathan 团队时期归档

- **归档时间（UTC）**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- **原路径**: \`/fop/biz\`
- **现路径**: \`${DEST_DIR}\`
- **Compose project**: \`${PROJECT_NAME}\`
- **旧 Web 宿主机口**: ${OLD_WEB_PORT} → **${NEW_WEB_PORT}**（建议仅 ${BIND_LOCAL}）
- **现行产品**: \`/opt/heyu\`（GitHub: fangjg16/heyu）

## 启动 / 停止（仅本机对照）

\`\`\`bash
cd ${DEST_DIR}
docker compose -p ${PROJECT_NAME} up -d
docker compose -p ${PROJECT_NAME} stop
\`\`\`

**禁止** \`down -v\`（会删数据卷）。公网域名不要反代到本归档。
EOF
  log "已写入标记: ${root}/NATHAN-TEAM.txt , ${root}/ARCHIVE.md"
}

remap_ports_in_compose() {
  local file="$1"
  local bak="${file}.bak-nathan-$(date +%Y%m%d%H%M%S)"
  cp -a "$file" "$bak"
  log "已备份 compose: $bak"

  # Remap published web port 18080 -> 127.0.0.1:28080
  local status
  status="$(
    python3 - "$file" "$OLD_WEB_PORT" "$NEW_WEB_PORT" "$BIND_LOCAL" <<'PY'
import re, sys
path, old, new, bind = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
text = open(path, encoding="utf-8").read()
orig = text

# "18080:80" or "18080:80/tcp"
text = re.sub(
    rf'(["\']){re.escape(old)}:([^"\']+)\1',
    lambda m: f"{m.group(1)}{bind}:{new}:{m.group(2)}{m.group(1)}",
    text,
)
# "0.0.0.0:18080:80" / ":::18080:80"
text = re.sub(
    rf'(["\'])(?:0\.0\.0\.0|::):{re.escape(old)}:([^"\']+)\1',
    lambda m: f"{m.group(1)}{bind}:{new}:{m.group(2)}{m.group(1)}",
    text,
)
# already loopback
text = re.sub(
    rf'(["\'])127\.0\.0\.1:{re.escape(old)}:([^"\']+)\1',
    lambda m: f"{m.group(1)}{bind}:{new}:{m.group(2)}{m.group(1)}",
    text,
)

# YAML unquoted: - 18080:80
text = re.sub(
    rf"(?m)^(\s*-\s*){re.escape(old)}:(\S+)",
    rf"\g<1>{bind}:{new}:\2",
    text,
)
text = re.sub(
    rf"(?m)^(\s*-\s*)(?:0\.0\.0\.0|127\.0\.0\.1|::):{re.escape(old)}:(\S+)",
    rf"\g<1>{bind}:{new}:\2",
    text,
)

if text == orig:
    print("NO_PORT_CHANGE")
else:
    open(path, "w", encoding="utf-8").write(text)
    print("PORT_REMAPPED")
PY
  )"
  if [[ "$status" == "PORT_REMAPPED" ]]; then
    log "已将 compose 中 ${OLD_WEB_PORT} 映射为 ${BIND_LOCAL}:${NEW_WEB_PORT}"
  else
    log "WARN: compose 中未自动改到 ${OLD_WEB_PORT}，请打开 $file 手工把宿主机口改到 ${NEW_WEB_PORT}"
  fi
}

patch_nginx() {
  if [[ ! -f "$NGINX_CONF" ]]; then
    log "未找到 $NGINX_CONF，跳过 nginx（请手工把 heyu.hk 从旧 18080 摘掉）"
    return 0
  fi
  local bak="${NGINX_CONF}.bak-nathan-$(date +%Y%m%d%H%M%S)"
  cp -a "$NGINX_CONF" "$bak"
  log "已备份 nginx: $bak"

  # If already redirecting to Pages, skip.
  if grep -qF "$PAGES_URL" "$NGINX_CONF" 2>/dev/null; then
    log "nginx 已含 Pages 跳转，跳过改写"
    return 0
  fi

  # Replace proxy_pass to old web with redirect; keep SSL server blocks structure.
  # Safer approach: write a small overlay snippet comment + replace proxy_pass lines to 18080.
  if grep -qE "proxy_pass\s+http://127\.0\.0\.1:${OLD_WEB_PORT}" "$NGINX_CONF"; then
    sed -i -E \
      "s#proxy_pass\s+http://127\.0\.0\.1:${OLD_WEB_PORT}[^;]*;#return 302 ${PAGES_URL};#g" \
      "$NGINX_CONF"
    # Annotate
    if ! grep -q "Nathan archive" "$NGINX_CONF"; then
      sed -i "1i# Nathan archive: old fop-web (:${OLD_WEB_PORT}) retired from public; see ${ARCHIVE_ROOT}/ARCHIVE.md" "$NGINX_CONF"
    fi
    log "已将 nginx 中 proxy_pass → :${OLD_WEB_PORT} 改为 302 ${PAGES_URL}"
  else
    log "nginx 中未找到 proxy_pass → :${OLD_WEB_PORT}，请人工检查 $NGINX_CONF"
  fi

  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    systemctl reload nginx || service nginx reload || true
    log "nginx 已 reload"
  fi
}

move_tree() {
  if [[ -d "$DEST_DIR" && ! -d "$SRC_DIR" ]]; then
    log "已归档过：存在 $DEST_DIR 且无 $SRC_DIR"
    return 0
  fi
  if [[ ! -d "$SRC_DIR" ]]; then
    die "找不到源目录 $SRC_DIR（若已手动挪走，设置 NATHAN_SRC_DIR=...）"
  fi
  mkdir -p "$ARCHIVE_ROOT"
  if [[ -e "$DEST_DIR" ]]; then
    die "目标已存在 $DEST_DIR，请先处理冲突"
  fi
  log "移动 $SRC_DIR → $DEST_DIR"
  mv "$SRC_DIR" "$DEST_DIR"
  # Leave a pointer at old path
  mkdir -p "$SRC_DIR"
  cat >"${SRC_DIR}/MOVED-TO-NATHAN-ARCHIVE.txt" <<EOF
此目录已迁移至 ${DEST_DIR}
标记说明见 ${ARCHIVE_ROOT}/ARCHIVE.md
现行合域平台部署在 /opt/heyu
EOF
}

recreate_stack() {
  local dc
  dc="$(compose_cmd)"
  local cfile
  if ! cfile="$(find_compose_file "$DEST_DIR")"; then
    log "WARN: $DEST_DIR 下未找到 compose 文件；目录与标记已就绪，请手工改端口后启动"
    return 0
  fi

  remap_ports_in_compose "$cfile"

  log "以项目名 ${PROJECT_NAME} 启动归档栈（高位端口）…"
  # Stop old project name containers if still running from previous cwd
  (cd "$DEST_DIR" && $dc -p biz down --remove-orphans) 2>/dev/null || true
  (cd "$DEST_DIR" && $dc -p "$PROJECT_NAME" up -d)
  log "归档容器状态："
  (cd "$DEST_DIR" && $dc -p "$PROJECT_NAME" ps) || true
}

main() {
  need_root
  command -v docker >/dev/null || die "需要 docker"
  command -v python3 >/dev/null || die "需要 python3（用于改 compose 端口）"

  log "源: $SRC_DIR"
  log "目标: $DEST_DIR"
  log "Web 端口: $OLD_WEB_PORT → ${BIND_LOCAL}:$NEW_WEB_PORT"

  move_tree
  write_markers "$ARCHIVE_ROOT"
  # also copy short marker into biz tree
  cp -a "${ARCHIVE_ROOT}/ARCHIVE.md" "${DEST_DIR}/ARCHIVE.md" 2>/dev/null || true
  cp -a "${ARCHIVE_ROOT}/NATHAN-TEAM.txt" "${DEST_DIR}/NATHAN-TEAM.txt" 2>/dev/null || true

  recreate_stack
  patch_nginx

  cat <<EOF

======== 完成 ========
Nathan 归档目录: ${DEST_DIR}
标记文件:       ${ARCHIVE_ROOT}/ARCHIVE.md
旧 Web 本机口:  ${BIND_LOCAL}:${NEW_WEB_PORT}（勿对公网安全组放行）
heyu.hk:        应 302 → ${PAGES_URL}

下一步部署现行栈:
  cd /opt && git clone https://github.com/fangjg16/heyu.git   # 若尚无
  cd /opt/heyu && cp deploy/ecs/.env.example deploy/ecs/.env && nano deploy/ecs/.env
  docker compose -f deploy/ecs/docker-compose.yml --env-file deploy/ecs/.env up -d --build

文档: docs/ECS-NATHAN-ARCHIVE.md
EOF
}

main "$@"
