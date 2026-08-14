import type { AppDatabase } from "./app-database";
import {
  listReviseInstructionLogs,
  type ChapterReviseInstructionLog,
} from "./chapter-revise-logs-db";
import { listProjects } from "./projects-db";
import { isPlatformAdmin } from "./projects-auth";
import { getWorkspaceUserById } from "./workspace-users-db";

type Env = { DB: AppDatabase };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUserId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  return id.length > 0 ? id : null;
}

async function requirePlatformAdmin(
  env: Env,
  authUserId: string,
): Promise<Response | null> {
  if (!(await isPlatformAdmin(env, authUserId))) {
    return json({ error: "仅平台管理员可查看改写指令日志", code: "FORBIDDEN" }, 403);
  }
  return null;
}

function mapLog(
  row: ChapterReviseInstructionLog,
  extras: { projectName?: string | null; userDisplayName?: string | null },
) {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: extras.projectName ?? row.projectId,
    runId: row.runId,
    sectionId: row.sectionId,
    userId: row.userId,
    userDisplayName: extras.userDisplayName ?? row.userId,
    instruction: row.instruction,
    reviseNote: row.reviseNote,
    status: row.status,
    error: row.error,
    llmBackend: row.llmBackend,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

/** GET /api/admin/chapter-revise-logs?projectId=&userId=&limit= */
export async function handleListAdminChapterReviseLogs(
  request: Request,
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const url = new URL(request.url);
  const projectId = normalizeUserId(url.searchParams.get("projectId")) ?? undefined;
  const filterUserId = normalizeUserId(url.searchParams.get("userId")) ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "80");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 80;

  const rows = await listReviseInstructionLogs(env.DB, {
    projectId,
    userId: filterUserId,
    limit,
  });

  const projects = await listProjects(env);
  const nameById = new Map(projects.map((p) => [p.id, p.name] as const));

  const displayByUser = new Map<string, string>();
  for (const row of rows) {
    if (displayByUser.has(row.userId)) continue;
    try {
      const u = await getWorkspaceUserById(env, row.userId);
      displayByUser.set(
        row.userId,
        u?.display_name?.trim() || u?.username?.trim() || row.userId,
      );
    } catch {
      displayByUser.set(row.userId, row.userId);
    }
  }

  return json({
    ok: true,
    total: rows.length,
    items: rows.map((r) =>
      mapLog(r, {
        projectName: nameById.get(r.projectId) ?? null,
        userDisplayName: displayByUser.get(r.userId) ?? null,
      }),
    ),
  });
}
