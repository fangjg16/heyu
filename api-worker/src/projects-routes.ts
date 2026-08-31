import type { AppObjectStorage } from "./app-storage";
import type { AppDatabase } from "./app-database";
import {
  computeProjectResearchMaturity,
} from "./chapter-maturity";
import { seedProjectMemberRoles } from "./project-member-roles-db";
import {
  canManageProjectRecord,
  canSeeProjectInDirectory,
  filterProjectsForDirectory,
  userSeesPlazaDiscovery,
} from "./projects-auth";
import {
  createProject,
  softDeleteProject,
  getProjectById,
  listProjects,
  normalizeProjectOpenness,
  normalizeProjectPhase,
  updateProject,
} from "./projects-db";
import { listResearchChapterHtmlForProjects } from "./project-knowledge-chapters-db";
import type { WorkspaceRole } from "./workspace-roles";
import { decodePathProjectId, resolveProjectForManage } from "./projects-resolve";

type Env = { DB: AppDatabase; FILES: AppObjectStorage };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUserId(raw: string | null): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 128) return null;
  return id;
}

async function researchMaturityByProjectId(
  env: Env,
  projectIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of projectIds) map.set(id, 0);
  if (projectIds.length === 0) return map;

  try {
    const rows = await listResearchChapterHtmlForProjects(env.DB, projectIds);
    const byProject = new Map<string, { sectionId: string; html: string }[]>();
    for (const row of rows) {
      const list = byProject.get(row.projectId) ?? [];
      list.push({ sectionId: row.sectionId, html: row.html });
      byProject.set(row.projectId, list);
    }
    for (const id of projectIds) {
      map.set(
        id,
        computeProjectResearchMaturity(byProject.get(id) ?? []),
      );
    }
  } catch {
    /* 章节表未迁移时仍返回项目列表，成熟度保持 0 */
  }
  return map;
}

export async function handleListProjects(
  env: Env,
  userIdRaw?: string | null,
): Promise<Response> {
  const projects = await listProjects(env);
  const userId = normalizeUserId(userIdRaw ?? null);
  const visible = await filterProjectsForDirectory(env, userId, projects);
  const maturity = await researchMaturityByProjectId(
    env,
    visible.map((p) => p.id),
  );
  return json({
    projects: visible.map((p) => ({
      ...p,
      researchMaturity: maturity.get(p.id) ?? 0,
    })),
  });
}

export async function handleGetProject(
  env: Env,
  pathProjectId: string,
  queryProjectId?: string | null,
  userIdRaw?: string | null,
): Promise<Response> {
  const project = await resolveProjectForManage(env, pathProjectId, queryProjectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  const userId = normalizeUserId(userIdRaw ?? null);
  if (!(await canSeeProjectInDirectory(env, project, userId))) {
    return json({ error: "项目不存在或无权查看" }, 404);
  }
  return json({ project });
}

export async function handleCreateProject(
  request: Request,
  env: Env,
  authUserId: string,
): Promise<Response> {
  let body: {
    name?: string;
    detail?: string;
    summary?: string;
    category?: string;
    phase?: string;
    openness?: string;
    analysisKind?: string;
    createdBy?: string;
    userId?: string;
    participants?: { userId?: string; role?: string }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const name = (body.name ?? "").trim();
  if (!name) return json({ error: "请填写项目名称" }, 400);

  const claimed = normalizeUserId(body.createdBy ?? body.userId ?? null);
  if (claimed && claimed !== authUserId) {
    return json(
      { error: "userId 与登录会话不一致", code: "USER_MISMATCH" },
      403,
    );
  }

  if (!(await userSeesPlazaDiscovery(env, authUserId))) {
    return json(
      { error: "项目协作方不能新建项目，请在已加入的协作项目中工作", code: "ISSUER_NO_CREATE" },
      403,
    );
  }

  const detail = (body.detail ?? body.summary ?? "").trim();
  const summary =
    detail ||
    `${name} 已创建，可上传资料包并在对话中使用 Master Agent 分析。`;
  const guestSummary = summary;
  const createdBy = authUserId;
  const analysisKindRaw = (body.analysisKind ?? "").trim();

  try {
    const project = await createProject(env, {
      name,
      summary,
      guestSummary,
      category: body.category,
      phase: body.phase as Parameters<typeof createProject>[1]["phase"],
      openness:
        body.openness !== undefined && String(body.openness).trim() !== ""
          ? normalizeProjectOpenness(body.openness)
          : analysisKindRaw === "early"
            ? "invite"
            : "partial",
      analysisKind: analysisKindRaw || null,
      createdBy,
    });

    const participants = (body.participants ?? [])
      .map((p) => ({
        userId: (p.userId ?? "").trim(),
        role: (p.role ?? "core").trim() as WorkspaceRole,
      }))
      .filter((p) => p.userId.length > 0)
      .map((p) =>
        analysisKindRaw === "early" && (p.role === "issuer" || p.role === "mid")
          ? { ...p, role: "core" as WorkspaceRole }
          : p,
      );

    if (createdBy) {
      try {
        await seedProjectMemberRoles(
          env,
          project.id,
          createdBy,
          participants,
          createdBy,
        );
      } catch {
        /* project_member_roles 表未迁移时不阻断创建 */
      }
    }

    return json({ project }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such table:\s*projects/i.test(msg)) {
      return json(
        {
          error:
            "projects 表未创建。请在 api-worker 目录执行：npm run mysql:migrate:local",
        },
        503,
      );
    }
    return json({ error: `创建项目失败：${msg}` }, 500);
  }
}

export async function handleUpdateProject(
  request: Request,
  env: Env,
  pathProjectId: string,
  authUserId: string,
): Promise<Response> {
  let body: {
    projectId?: string;
    name?: string;
    detail?: string;
    summary?: string;
    guestSummary?: string;
    category?: string;
    phase?: string;
    openness?: string;
    userId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const claimed = normalizeUserId(body.userId ?? null);
  if (claimed && claimed !== authUserId) {
    return json(
      { error: "userId 与登录会话不一致", code: "USER_MISMATCH" },
      403,
    );
  }
  const userId = authUserId;

  const existing = await resolveProjectForManage(env, pathProjectId, body.projectId);
  if (!existing) return json({ error: "项目不存在" }, 404);
  if (!(await canManageProjectRecord(env, existing, userId))) {
    return json({ error: "仅项目创建人或平台管理员可编辑" }, 403);
  }

  const projectId = existing.id;
  const detail = (body.detail ?? body.summary)?.trim();
  try {
    const project = await updateProject(env, projectId, {
      name: body.name?.trim(),
      summary: detail !== undefined ? detail || existing.summary : undefined,
      category: body.category?.trim(),
      phase: body.phase ? normalizeProjectPhase(body.phase) : undefined,
      openness:
        body.openness !== undefined
          ? normalizeProjectOpenness(body.openness)
          : undefined,
    });
    if (!project) return json({ error: "项目不存在" }, 404);
    return json({ project });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `更新失败：${msg}` }, 500);
  }
}

export async function handleDeleteProject(
  request: Request,
  env: Env,
  pathProjectId: string,
  authUserId: string,
): Promise<Response> {
  const url = new URL(request.url);
  let bodyProjectId: string | null = decodePathProjectId(
    url.searchParams.get("projectId") ?? "",
  );
  const claimedQuery = normalizeUserId(url.searchParams.get("userId"));
  if (claimedQuery && claimedQuery !== authUserId) {
    return json(
      { error: "userId 与登录会话不一致", code: "USER_MISMATCH" },
      403,
    );
  }
  if (request.headers.get("Content-Type")?.includes("application/json")) {
    try {
      const body = (await request.json()) as { userId?: string; projectId?: string };
      const claimedBody = normalizeUserId(body.userId ?? null);
      if (claimedBody && claimedBody !== authUserId) {
        return json(
          { error: "userId 与登录会话不一致", code: "USER_MISMATCH" },
          403,
        );
      }
      if (body.projectId) bodyProjectId = body.projectId.trim();
    } catch {
      /* 无 body */
    }
  }
  const userId = authUserId;

  const existing = await resolveProjectForManage(env, pathProjectId, bodyProjectId);
  if (!existing) return json({ error: "项目不存在" }, 404);
  if (!(await canManageProjectRecord(env, existing, userId))) {
    return json({ error: "仅项目创建人或平台管理员可删除" }, 403);
  }

  const projectId = existing.id;
  try {
    await softDeleteProject(env, projectId);
    return json({ ok: true, projectId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `删除失败：${msg}` }, 500);
  }
}
