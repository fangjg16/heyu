import type { AppDatabase } from "./app-database";
import {
  deleteProjectMemberRole,
  isAssignableProjectRole,
  listKnownWorkspaceUsers,
  listProjectMemberRoleOverrides,
  upsertProjectMemberRole,
} from "./project-member-roles-db";
import { canManageProjectRecord, isPlatformAdmin } from "./projects-auth";
import { getProjectById, listProjects } from "./projects-db";
import { decodePathProjectId } from "./projects-resolve";
import { resolveProjectRole, type WorkspaceRole } from "./workspace-roles";

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

const ROLE_RANK: Record<WorkspaceRole, number> = {
  guest: 0,
  low: 1,
  mid: 2,
  core: 3,
  admin: 4,
};

function higherRole(a: WorkspaceRole, b: WorkspaceRole): WorkspaceRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

export type ProjectPermissionMember = {
  userId: string;
  displayName: string;
  defaultRole: WorkspaceRole;
  overrideRole: WorkspaceRole | null;
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
    const defaultRole = knownUser?.defaultRole ?? "guest";
    const displayName = knownUser?.displayName ?? userId;
    const platformAdmin = Boolean(knownUser?.isPlatformAdmin);
    const overrideRole = overrides[userId] ?? null;
    let effectiveRole: WorkspaceRole = overrideRole ?? (creator === userId ? "core" : "guest");
    const isCreator = Boolean(creator && creator === userId);
    if (isCreator) {
      effectiveRole = higherRole(effectiveRole, "core");
    }
    if (platformAdmin) {
      effectiveRole = "admin";
    }
    members.push({
      userId,
      displayName,
      defaultRole,
      overrideRole,
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

  const canManage = await canManageProjectRecord(env, project, userId);
  if (!canManage) {
    return json({ error: "仅平台管理员或项目创建人可查看权限管理" }, 403);
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

  if (!(await canManageProjectRecord(env, project, userId))) {
    return json({ error: "仅平台管理员或项目创建人可修改权限" }, 403);
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
    if (creator && creator === targetId) {
      role = higherRole(role, "core");
    }
    await upsertProjectMemberRole(env, projectId, targetId, role, userId);
  }

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
