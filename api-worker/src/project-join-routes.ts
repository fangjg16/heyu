import type { AppDatabase } from "./app-database";
import { upsertProjectMemberRole } from "./project-member-roles-db";
import {
  canManageProjectRecord,
  isUserProjectMember,
  userSeesPlazaDiscovery,
} from "./projects-auth";
import { getProjectById, normalizeProjectOpenness } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import {
  getJoinRequestById,
  getJoinRequestByProjectAndApplicant,
  listJoinRequestsForApplicant,
  listJoinRequestsForProject,
  reviewJoinRequest,
  upsertPendingJoinRequest,
} from "./project-join-db";
import {
  getDefaultRoleForUser,
  isKnownWorkspaceUser,
} from "./workspace-users-db";

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

function isMissingJoinTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /no such table|doesn't exist|Unknown table/i.test(msg);
}

/** POST /api/projects/:id/join-requests */
export async function handleCreateJoinRequest(
  env: Env,
  pathProjectId: string,
  authUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);

  if (!(await isKnownWorkspaceUser(env, userId))) {
    return json({ error: "用户不存在或已停用" }, 403);
  }

  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  if (normalizeProjectOpenness(project.openness) !== "partial") {
    return json(
      { error: "该项目为内部邀请，无法通过广场申请加入", code: "NOT_PARTIAL" },
      400,
    );
  }

  if (await isUserProjectMember(env, project, userId)) {
    return json({ error: "你已是该项目成员", code: "ALREADY_MEMBER" }, 400);
  }

  if (!(await userSeesPlazaDiscovery(env, userId))) {
    return json(
      {
        error: "项目方不能通过广场申请加入其他项目，请等待投资团队邀请",
        code: "ISSUER_NO_PLAZA",
      },
      403,
    );
  }

  try {
    const existing = await getJoinRequestByProjectAndApplicant(
      env,
      projectId,
      userId,
    );
    if (existing?.status === "pending") {
      return json(
        {
          error: "你已提交过加入申请，请等待审批",
          code: "ALREADY_PENDING",
          request: existing,
        },
        409,
      );
    }
    if (existing?.status === "approved") {
      return json({ error: "你已是该项目成员", code: "ALREADY_MEMBER" }, 400);
    }

    const created = await upsertPendingJoinRequest(env, projectId, userId);
    return json({ request: created }, 201);
  } catch (e) {
    if (isMissingJoinTable(e)) {
      return json(
        { error: "加入申请功能尚未迁移（缺少 project_join_requests 表）" },
        503,
      );
    }
    throw e;
  }
}

/** GET /api/me/join-requests */
export async function handleListMyJoinRequests(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);
  try {
    const requests = await listJoinRequestsForApplicant(env, userId);
    return json({ requests });
  } catch (e) {
    if (isMissingJoinTable(e)) return json({ requests: [] });
    throw e;
  }
}

/** GET /api/projects/:id/join-requests */
export async function handleListProjectJoinRequests(
  env: Env,
  pathProjectId: string,
  authUserId: string,
  statusRaw?: string | null,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);

  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  if (!(await canManageProjectRecord(env, project, userId))) {
    return json({ error: "仅平台管理员或项目创建人可查看加入申请" }, 403);
  }

  const status =
    statusRaw === "pending" ||
    statusRaw === "approved" ||
    statusRaw === "rejected"
      ? statusRaw
      : null;

  try {
    const requests = await listJoinRequestsForProject(env, projectId, status);
    return json({ projectId, requests });
  } catch (e) {
    if (isMissingJoinTable(e)) return json({ projectId, requests: [] });
    throw e;
  }
}

/** PATCH /api/projects/:id/join-requests/:requestId */
export async function handleReviewJoinRequest(
  request: Request,
  env: Env,
  pathProjectId: string,
  pathRequestId: string,
  authUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);

  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  if (!(await canManageProjectRecord(env, project, userId))) {
    return json({ error: "仅平台管理员或项目创建人可审批加入申请" }, 403);
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const raw = String(body.status ?? "")
    .trim()
    .toLowerCase();
  const next = raw === "approved" || raw === "rejected" ? raw : null;
  if (!next) {
    return json({ error: "status 须为 approved 或 rejected" }, 400);
  }

  const requestId = decodeURIComponent(pathRequestId).trim();
  let existing;
  try {
    existing = await getJoinRequestById(env, requestId);
  } catch (e) {
    if (isMissingJoinTable(e)) {
      return json(
        { error: "加入申请功能尚未迁移（缺少 project_join_requests 表）" },
        503,
      );
    }
    throw e;
  }

  if (!existing || existing.projectId !== projectId) {
    return json({ error: "申请不存在" }, 404);
  }
  if (existing.status !== "pending") {
    return json(
      { error: "该申请已处理", code: "ALREADY_REVIEWED", request: existing },
      409,
    );
  }

  const updated = await reviewJoinRequest(env, requestId, next, userId);
  if (!updated || updated.status !== next) {
    return json({ error: "审批失败，请刷新后重试" }, 409);
  }

  if (next === "approved") {
    let role: "admin" | "core" | "low" = "low";
    try {
      const def = await getDefaultRoleForUser(env, updated.applicantUserId);
      if (def === "admin" || def === "core" || def === "low") role = def;
      // mid（Advanced）本阶段不新分配，审批落入 Basic
    } catch {
      /* 保持 low */
    }
    await upsertProjectMemberRole(
      env,
      projectId,
      updated.applicantUserId,
      role,
      userId,
    );
  }

  return json({ request: updated });
}
