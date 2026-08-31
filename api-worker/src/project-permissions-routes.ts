import type { AppDatabase } from "./app-database";
import {
  deleteProjectMemberRole,
  isAssignableProjectRole,
  listKnownWorkspaceUsers,
  listProjectMemberRoleOverrides,
  upsertProjectMemberRole,
} from "./project-member-roles-db";
import { canManageProjectRecord, isPlatformAdmin } from "./projects-auth";
import { getProjectById, listProjects, type ProjectJson } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import { resolveProjectRole, roleWithCreatorFloor, type WorkspaceRole } from "./workspace-roles";
import { formatUserLabel, recordOperationLog } from "./operation-logs-db";
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

export type ProjectPermissionMember = {
  userId: string;
  displayName: string;
  role: WorkspaceRole | null;
  effectiveRole: WorkspaceRole;
  isCreator: boolean;
  isPlatformAdmin: boolean;
};

async function buildPermissionMembers(
  env: Env,
  projectId: string,
  createdBy: string | null,
): Promise<ProjectPermissionMember[]> {
  const overrides = await listProjectMemberRoleOverrides(env, projectId);
  const creator = (createdBy ?? "").trim();
  const known = await listKnownWorkspaceUsers(env);
  const byId = new Map(known.map((u) => [u.userId, u]));

  /** 仅项目成员：创建人 + 已写入 project_member_roles 的用户 */
  const memberIds = new Set<string>(Object.keys(overrides));
  if (creator) memberIds.add(creator);

  const members: ProjectPermissionMember[] = [];
  for (const userId of memberIds) {
    const knownUser = byId.get(userId);
    const displayName = knownUser?.displayName ?? userId;
    const platformAdmin = Boolean(knownUser?.isPlatformAdmin);
    const memberRole = overrides[userId] ?? null;
    const isCreator = Boolean(creator && creator === userId);
    let effectiveRole: WorkspaceRole = roleWithCreatorFloor(
      userId,
      creator,
      memberRole,
    );
    if (platformAdmin) {
      effectiveRole = "admin";
    }
    members.push({
      userId,
      displayName,
      role: memberRole,
      effectiveRole,
      isCreator,
      isPlatformAdmin: platformAdmin,
    });
  }

  members.sort((a, b) => {
    if (a.isCreator !== b.isCreator) return a.isCreator ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, "zh");
  });
  return members;
}

async function canManageProjectMembers(
  env: Env,
  project: ProjectJson,
  userId: string,
): Promise<boolean> {
  if (await canManageProjectRecord(env, project, userId)) return true;
  const role = await resolveProjectRole(
    env,
    userId,
    project.id,
    project.createdBy,
  );
  return role === "admin";
}

/** GET /api/projects/:id/permissions?userId= */
export async function handleGetProjectPermissions(
  env: Env,
  pathProjectId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId 查询参数" }, 400);

  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const canManage = await canManageProjectMembers(env, project, userId);
  if (!canManage) {
    return json({ error: "仅项目管理员或项目创建人可查看成员权限" }, 403);
  }

  const members = await buildPermissionMembers(env, projectId, project.createdBy);
  return json({
    projectId,
    createdBy: project.createdBy,
    canManage: true,
    members,
  });
}

/** PUT /api/projects/:id/permissions?userId= */
export async function handlePutProjectPermissions(
  request: Request,
  env: Env,
  pathProjectId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId 查询参数" }, 400);

  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  if (!(await canManageProjectMembers(env, project, userId))) {
    return json({ error: "仅项目管理员或项目创建人可修改成员权限" }, 403);
  }

  let body: {
    updates?: {
      userId?: string;
      role?: string | null;
      remove?: boolean | string | number;
    }[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const updates = body.updates ?? [];
  if (!Array.isArray(updates) || updates.length === 0) {
    return json({ error: "请提供 updates 数组" }, 400);
  }

  const creator = (project.createdBy ?? "").trim();

  for (const item of updates) {
    const targetId = normalizeUserId(item.userId ?? null);
    if (!targetId) return json({ error: "updates 中缺少 userId" }, 400);
    if (await isPlatformAdmin(env, targetId)) {
      return json({ error: "平台管理员权限不可在此修改" }, 400);
    }
    // 兼容 boolean / "true" / 1；取消成员时前端可能只带 remove、不带 role
    const removeFlag = item.remove;
    const shouldRemove =
      removeFlag === true ||
      removeFlag === 1 ||
      removeFlag === "true" ||
      removeFlag === "1";
    if (shouldRemove) {
      if (creator && creator === targetId) {
        return json({ error: "不能移除项目创建人" }, 400);
      }
      await deleteProjectMemberRole(env, projectId, targetId);
      continue;
    }
    const rawRole = (item.role ?? "").trim();
    if (!isAssignableProjectRole(rawRole)) {
      return json(
        {
          error: rawRole
            ? `无效角色：${rawRole}`
            : "无效角色：缺少 role（取消成员请传 remove: true）",
        },
        400,
      );
    }
    let role: WorkspaceRole = rawRole;
    if (
      project.analysisKind === "early" &&
      (role === "issuer" || role === "mid")
    ) {
      role = "core";
    }
    role = roleWithCreatorFloor(targetId, creator, role);
    await upsertProjectMemberRole(env, projectId, targetId, role, userId);
  }

  const bits: string[] = [];
  for (const item of updates) {
    const targetId = normalizeUserId(item.userId ?? null);
    if (!targetId) continue;
    const target = await getWorkspaceUserById(env, targetId);
    const label = formatUserLabel(target, targetId);
    const removeFlag = item.remove;
    const shouldRemove =
      removeFlag === true ||
      removeFlag === 1 ||
      removeFlag === "true" ||
      removeFlag === "1";
    if (shouldRemove) {
      bits.push(`移出 ${label}`);
      continue;
    }
    const rawRole = (item.role ?? "").trim();
    const roleText =
      rawRole === "admin"
        ? "项目管理员"
        : rawRole === "core"
          ? "Core"
          : rawRole === "issuer"
            ? "项目协作方"
            : rawRole === "low" || rawRole === "mid"
              ? "Basic"
              : rawRole;
    bits.push(`${label} → ${roleText}`);
  }
  await recordOperationLog(env.DB, {
    actorUserId: userId,
    category: "permission",
    action: "update",
    targetKind: "project",
    targetId: projectId,
    targetLabel: project.name,
    summary: `更新「${project.name}」成员：${bits.join("；") || "无变更"}`,
  });

  const members = await buildPermissionMembers(env, projectId, project.createdBy);
  return json({
    ok: true,
    projectId,
    createdBy: project.createdBy,
    members,
  });
}

/** GET /api/users/:userId/project-roles — 当前用户在各项目上的有效角色 */
export async function handleGetUserProjectRoles(
  env: Env,
  routeUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(routeUserId);
  if (!userId) return json({ error: "无效 userId" }, 400);

  const projects = await listProjects(env);
  const roles: Record<string, WorkspaceRole> = {};
  for (const p of projects) {
    roles[p.id] = await resolveProjectRole(env, userId, p.id, p.createdBy);
  }
  return json({ userId, roles });
}
