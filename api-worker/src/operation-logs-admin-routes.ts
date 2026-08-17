import type { AppDatabase } from "./app-database";
import {
  listOperationLogs,
  type OperationCategory,
  type PlatformOperationLog,
} from "./operation-logs-db";
import { isPlatformAdmin } from "./projects-auth";
import { getWorkspaceUserById } from "./workspace-users-db";

type Env = { DB: AppDatabase };

export const OPERATION_CATEGORY_LABELS: Record<OperationCategory, string> = {
  user: "用户",
  permission: "项目权限",
  join: "加入审批",
  llm: "模型与密钥",
  skill: "Skills",
  file: "文件",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  return id.length > 0 ? id : null;
}

async function requirePlatformAdmin(
  env: Env,
  authUserId: string,
): Promise<Response | null> {
  if (!(await isPlatformAdmin(env, authUserId))) {
    return json({ error: "仅平台管理员可查看操作日志", code: "FORBIDDEN" }, 403);
  }
  return null;
}

async function displayName(
  env: Env,
  userId: string,
  cache: Map<string, string>,
): Promise<string> {
  if (cache.has(userId)) return cache.get(userId) ?? userId;
  try {
    const u = await getWorkspaceUserById(env, userId);
    const name = u?.display_name?.trim() || u?.username?.trim() || userId;
    cache.set(userId, name);
    return name;
  } catch {
    cache.set(userId, userId);
    return userId;
  }
}

function mapLog(
  row: PlatformOperationLog,
  actorDisplayName: string,
) {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    actorDisplayName,
    category: row.category,
    categoryLabel: OPERATION_CATEGORY_LABELS[row.category] ?? row.category,
    action: row.action,
    targetKind: row.targetKind,
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    summary: row.summary,
    createdAt: row.createdAt,
  };
}

/** GET /api/admin/operation-logs?category=&actorUserId=&limit= */
export async function handleListAdminOperationLogs(
  request: Request,
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const url = new URL(request.url);
  const category = normalizeId(url.searchParams.get("category")) ?? undefined;
  const actorUserId =
    normalizeId(url.searchParams.get("actorUserId")) ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "80");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 80;

  const rows = await listOperationLogs(env.DB, {
    category,
    actorUserId,
    limit,
  });

  const names = new Map<string, string>();
  const items = [];
  for (const row of rows) {
    const actorDisplayName = await displayName(env, row.actorUserId, names);
    items.push(mapLog(row, actorDisplayName));
  }

  return json({ ok: true, total: items.length, items });
}
