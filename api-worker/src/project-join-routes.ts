import type { AppDatabase } from "./app-database";
import { upsertProjectMemberRole } from "./project-member-roles-db";
import { isUserProjectMember, userSeesPlazaDiscovery } from "./projects-auth";
import { getProjectById, listProjects, normalizeProjectOpenness, type ProjectJson } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import {
  getJoinRequestById,
  getJoinRequestByProjectAndApplicant,
  listJoinRequestsForApplicant,
  listJoinRequestsForProject,
  listPendingJoinRequests,
  listReviewedJoinRequests,
  reviewJoinRequest,
  upsertPendingJoinRequest,
  deletePendingJoinRequestByApplicant,
} from "./project-join-db";
import { listCollabItemsForProjects } from "./collab-db";
import { listProjectNoticesForUser, markProjectNoticesRead } from "./project-notices-db";
import {
  isOpenKnDraftRunStatus,
  knDraftRunIdFromHref,
} from "./kn-draft-notice";
import { listDraftRunsByIds } from "./project-knowledge-chapter-revisions-db";
import { canManageProjectCollab, resolveProjectRole } from "./workspace-roles";
import {
  getWorkspaceUserById,
  isKnownWorkspaceUser,
} from "./workspace-users-db";
import { parseApprovedJoinRole } from "./project-join-role";
import { formatUserLabel, recordOperationLog } from "./operation-logs-db";

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

async function canReviewProjectJoins(
  env: Env,
  userId: string,
  project: ProjectJson,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, project.id, project.createdBy);
  return role === "admin";
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
        error: "项目协作方不能通过广场申请加入其他项目，请等待投资团队邀请",
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

/** DELETE /api/projects/:id/join-requests — 申请人撤回自己的待审批申请 */
export async function handleWithdrawJoinRequest(
  env: Env,
  pathProjectId: string,
  authUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);

  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  try {
    const existing = await getJoinRequestByProjectAndApplicant(
      env,
      projectId,
      userId,
    );
    if (existing?.status === "approved") {
      return json({ error: "你已是该项目成员，无法撤回", code: "ALREADY_MEMBER" }, 400);
    }
    const deleted = await deletePendingJoinRequestByApplicant(env, projectId, userId);
    if (!deleted) {
      return json(
        { error: "当前没有待审批的加入申请", code: "NOT_PENDING" },
        404,
      );
    }
    return json({ ok: true, projectId });
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

async function enrichJoinRequest(
  env: Env,
  req: Awaited<ReturnType<typeof listPendingJoinRequests>>[number],
  projectName: string,
): Promise<Record<string, unknown>> {
  const applicant = await getWorkspaceUserById(env, req.applicantUserId);
  const reviewer = req.reviewedBy
    ? await getWorkspaceUserById(env, req.reviewedBy)
    : null;
  return {
    ...req,
    projectName,
    applicantDisplayName: applicant?.display_name ?? req.applicantUserId,
    reviewedByDisplayName: reviewer?.display_name ?? req.reviewedBy ?? null,
  };
}

/** GET /api/me/join-reviews 待我审批的加入申请 + 已处理历史 + 协作提交 */
export async function handleListMyJoinReviews(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);
  try {
    const projects = await listProjects(env);
    const byId = new Map(projects.map((p) => [p.id, p]));

    const pending = await listPendingJoinRequests(env);
    const requests = [];
    for (const req of pending) {
      const project = byId.get(req.projectId);
      if (!project) continue;
      if (!(await canReviewProjectJoins(env, userId, project))) continue;
      requests.push(await enrichJoinRequest(env, req, project.name));
    }

    const reviewedRaw = await listReviewedJoinRequests(env);
    const reviewed = [];
    for (const req of reviewedRaw) {
      const project = byId.get(req.projectId);
      if (!project) continue;
      if (!(await canReviewProjectJoins(env, userId, project))) continue;
      reviewed.push(await enrichJoinRequest(env, req, project.name));
    }

    let collabSubmitted: Record<string, unknown>[] = [];
    try {
      const collabProjectIds: string[] = [];
      for (const project of projects) {
        if (await canManageProjectCollab(env, userId, project.id, project.createdBy)) {
          collabProjectIds.push(project.id);
        }
      }
      const collabRows = await listCollabItemsForProjects(env, collabProjectIds);
      for (const row of collabRows) {
        if (row.status !== "submitted") continue;
        const project = byId.get(row.project_id);
        if (!project) continue;
        const submitter = row.reply_by
          ? await getWorkspaceUserById(env, row.reply_by)
          : null;
        collabSubmitted.push({
          id: row.id,
          projectId: row.project_id,
          projectName: project.name,
          title: row.title,
          replyBy: row.reply_by,
          replyByName: submitter?.display_name ?? row.reply_by ?? "项目协作方",
          replySubmittedAt: row.reply_submitted_at,
        });
      }
      collabSubmitted.sort((a, b) =>
        String(b.replySubmittedAt ?? "").localeCompare(String(a.replySubmittedAt ?? "")),
      );
    } catch {
      collabSubmitted = [];
    }

    let projectNotices: Record<string, unknown>[] = [];
    try {
      const rows = await listProjectNoticesForUser(env.DB, userId, 80);
      const knRunIds = [
        ...new Set(
          rows
            .filter((n) => n.kind === "kn_draft")
            .map((n) => knDraftRunIdFromHref(n.href))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      let openRunIds = new Set<string>();
      if (knRunIds.length > 0) {
        try {
          const runs = await listDraftRunsByIds(env.DB, knRunIds);
          openRunIds = new Set(
            runs
              .filter((r) => isOpenKnDraftRunStatus(r.status))
              .map((r) => r.id),
          );
        } catch {
          openRunIds = new Set(knRunIds);
        }
      }
      projectNotices = rows
        .filter((n) => {
          if (n.kind !== "kn_draft") return true;
          const runId = knDraftRunIdFromHref(n.href);
          if (!runId) return true;
          return openRunIds.has(runId);
        })
        .map((n) => ({
          id: n.id,
          projectId: n.projectId,
          projectName: byId.get(n.projectId)?.name ?? n.projectId,
          actorUserId: n.actorUserId,
          kind: n.kind,
          title: n.title,
          summary: n.summary,
          href: n.href,
          createdAt: n.createdAt,
          readAt: n.kind === "kn_draft" ? null : n.readAt,
        }));
    } catch {
      projectNotices = [];
    }

    return json({ requests, reviewed, collabSubmitted, projectNotices });
  } catch (e) {
    if (isMissingJoinTable(e)) {
      return json({
        requests: [],
        reviewed: [],
        collabSubmitted: [],
        projectNotices: [],
      });
    }
    throw e;
  }
}

/** POST /api/me/notices/read  { ids: string[] } */
export async function handleMarkMyNoticesRead(
  env: Env,
  authUserId: string,
  body: unknown,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);
  const idsRaw =
    body && typeof body === "object" && "ids" in body
      ? (body as { ids?: unknown }).ids
      : null;
  const ids = Array.isArray(idsRaw)
    ? idsRaw.filter((id): id is string => typeof id === "string")
    : [];
  if (ids.length === 0) return json({ error: "ids 必填" }, 400);
  try {
    const updated = await markProjectNoticesRead(env.DB, userId, ids);
    return json({ ok: true, updated });
  } catch (e) {
    if (isMissingJoinTable(e)) return json({ ok: true, updated: 0 });
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

  if (!(await canReviewProjectJoins(env, userId, project))) {
    return json({ error: "仅项目管理员可查看加入申请" }, 403);
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

  if (!(await canReviewProjectJoins(env, userId, project))) {
    return json({ error: "仅项目管理员可审批加入申请" }, 403);
  }

  let body: { status?: string; role?: unknown };
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

  let assignedRole: ReturnType<typeof parseApprovedJoinRole> = "low";
  if (next === "approved") {
    const fallback = project.analysisKind === "early" ? "core" : "low";
    assignedRole = parseApprovedJoinRole(body.role, fallback);
    if (assignedRole && project.analysisKind === "early" && assignedRole === "issuer") {
      assignedRole = "core";
    }
    if (!assignedRole) {
      return json(
        {
          error:
            "通过时须指定项目协作方，或投资方的项目管理员 / Core / Basic",
          code: "INVALID_ROLE",
        },
        400,
      );
    }
  }

  const updated = await reviewJoinRequest(env, requestId, next, userId);
  if (!updated || updated.status !== next) {
    return json({ error: "审批失败，请刷新后重试" }, 409);
  }

  if (next === "approved" && assignedRole) {
    await upsertProjectMemberRole(
      env,
      projectId,
      updated.applicantUserId,
      assignedRole,
      userId,
    );
  }

  const applicant = await getWorkspaceUserById(env, updated.applicantUserId);
  const who = formatUserLabel(applicant, updated.applicantUserId);
  await recordOperationLog(env.DB, {
    actorUserId: userId,
    category: "join",
    action: next,
    targetKind: "project",
    targetId: projectId,
    targetLabel: project.name,
    summary:
      next === "approved"
        ? `通过 ${who} 加入「${project.name}」`
        : `拒绝 ${who} 加入「${project.name}」`,
  });

  return json({ request: updated, assignedRole: next === "approved" ? assignedRole : null });
}
