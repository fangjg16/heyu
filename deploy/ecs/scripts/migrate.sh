#!/usr/bin/env bash
# Run MySQL schema against the compose MySQL (from repo root on ECS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/deploy/ecs/docker-compose.yml" --env-file "$ROOT/deploy/ecs/.env")

echo "[migrate] applying api-worker/schema.mysql.sql ..."
"${COMPOSE[@]}" exec -T mysql \
  sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  < "$ROOT/api-worker/schema.mysql.sql"

if [[ -d "$ROOT/api-worker/migrations" ]]; then
  for f in "$ROOT/api-worker/migrations"/*.sql; do
    [[ -f "$f" ]] || continue
    echo "[migrate] applying $(basename "$f") ..."
    "${COMPOSE[@]}" exec -T mysql \
      sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
      < "$f" || true
  done
fi

echo "[migrate] seeding workspace demo users ..."
"${COMPOSE[@]}" exec -T jfo-api node scripts/seed-workspace-users.mjs

# 种子若来自尚未更新的镜像，可能把 janicehi 写回去。再应用一次，只改仍是旧登录名的那条。
if [[ -f "$ROOT/api-worker/migrations/0043_janice_login_maxeast_co.sql" ]]; then
  echo "[migrate] keeping janice-hi login rename ..."
  "${COMPOSE[@]}" exec -T mysql \
    sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
    < "$ROOT/api-worker/migrations/0043_janice_login_maxeast_co.sql" || true
fi

echo "[migrate] seeding knowledge-network chapter templates ..."
"${COMPOSE[@]}" exec -T jfo-api node scripts/seed-kn-chapter-templates.mjs --force

echo "[migrate] done. Check: curl -sS \"\${JFO_API_PUBLIC_BASE}/api/health\""
echo "[migrate] demo login e.g. jimmyhuang / jfo2026 (see api-worker/scripts/seed-workspace-users.mjs)"
