import type { AppDatabase } from "./app-database";
import { hashPassword } from "./password-crypto";
import {
  deleteProjectMemberRole,
  listMemberRoleOverridesForUser,
} from "./project-member-roles-db";
import { isPlatformAdmin } from "./projects-auth";
import { getProjectById, listProjects } from "./projects-db";
import { resolveProjectRole } from "./workspace-roles";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  getWorkspaceUserById,
  listAllWorkspaceUsers,
  normalizeUsername,
  rowToAdminPublic,
  updateWorkspaceUser,
  updateWorkspaceUserPassword,
} from "./workspace-users-db";
import { formatUserLabel, recordOperationLog } from "./operation-logs-db";

type Env = { DB: AppDatabase };

const MIN_PASSWORD_LEN = 8;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function requirePlatformAdmin(
  env: Env,
  authUserId: string,
): Promise<Response | null> {
  if (!(await isPlatformAdmin(env, authUserId))) {
    return json({ error: "需要平台管理员权限", code: "FORBIDDEN" }, 403);
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LEN) {
    return `密码至少 ${MIN_PASSWORD_LEN} 位`;
  }
  return null;
}

export async function handleAdminListWorkspaceUsers(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const rows = await listAllWorkspaceUsers(env);
  return json({ users: rows.map((row) => rowToAdminPublic(row)) });
}

export async function handleAdminCreateWorkspaceUser(
  request: Request,
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  let body: {
    username?: string;
    password?: string;
    displayName?: string;
    orgTitle?: string;
    avatarChar?: string;
    avatarClass?: string;
    avatarUrl?: string;
    isPlatformAdmin?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const username = normalizeUsername(body.username ?? "");
  const password = body.password ?? "";
  const displayName = (body.displayName ?? "").trim();
  if (!username) return json({ error: "请填写登录名" }, 400);
  if (!displayName) return json({ error: "请填写展示名" }, 400);
  const pwErr = validatePassword(password);
  if (pwErr) return json({ error: pwErr }, 400);

  try {
    const hashed = await hashPassword(password);
    const row = await createWorkspaceUser(env, {
      username,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordIters: hashed.iterations,
      displayName,
      orgTitle: body.orgTitle,
      avatarChar: body.avatarChar,
      avatarClass: body.avatarClass,
      avatarUrl: body.avatarUrl,
      isPlatformAdmin: Boolean(body.isPlatformAdmin),
    });
    await recordOperationLog(env.DB, {
      actorUserId: authUserId,
      category: "user",
      action: "create",
      targetKind: "user",
      targetId: row.id,
      targetLabel: formatUserLabel(row, row.id),
      summary: `新建用户 ${formatUserLabel(row, row.id)}`,
    });
    return json({ user: rowToAdminPublic(row) }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /已存在|无效/.test(msg) ? 409 : 500;
    return json({ error: msg }, status);
  }
}

export async function handleAdminPatchWorkspaceUser(
  request: Request,
  env: Env,
  authUserId: string,
  targetUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const id = targetUserId.trim();
  if (!id) return json({ error: "缺少用户 ID" }, 400);

  let body: {
    username?: string;
    displayName?: string;
    orgTitle?: string;
    avatarChar?: string;
    avatarClass?: string;
    avatarUrl?: string;
    isPlatformAdmin?: boolean;
    status?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (id === authUserId) {
    if (body.status === "disabled") {
      return json({ error: "不能停用当前登录的管理员账号" }, 400);
    }
    if (body.isPlatformAdmin === false) {
      return json({ error: "不能取消自己的平台管理员权限" }, 400);
    }
  }

  let status: "active" | "disabled" | undefined;
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      return json({ error: "status 须为 active 或 disabled" }, 400);
    }
    status = body.status;
  }

  try {
    const row = await updateWorkspaceUser(env, id, {
      username: body.username,
      displayName: body.displayName,
      orgTitle: body.orgTitle,
      avatarChar: body.avatarChar,
      avatarClass: body.avatarClass,
      avatarUrl: body.avatarUrl,
      isPlatformAdmin: body.isPlatformAdmin,
      status,
    });
    const label = formatUserLabel(row, id);
    const bits: string[] = [];
    if (status === "disabled") bits.push("停用");
    else if (status === "active") bits.push("启用");
    if (body.isPlatformAdmin === true) bits.push("设为平台管理员");
    else if (body.isPlatformAdmin === false) bits.push("取消平台管理员");
    if (body.displayName !== undefined) bits.push("改展示名");
    if (body.orgTitle !== undefined) bits.push("改隶属组织");
    if (body.username !== undefined) bits.push("改登录名");
    if (body.avatarUrl !== undefined) bits.push("改头像");
    await recordOperationLog(env.DB, {
      actorUserId: authUserId,
      category: "user",
      action: status === "disabled" ? "disable" : status === "active" ? "enable" : "update",
      targetKind: "user",
      targetId: id,
      targetLabel: label,
      summary: bits.length > 0 ? `${bits.join("、")} ${label}` : `更新用户 ${label}`,
    });
    return json({ user: rowToAdminPublic(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const statusCode = /不存在/.test(msg) ? 404 : /已存在|无效/.test(msg) ? 409 : 500;
    return json({ error: msg }, statusCode);
  }
}

/** DELETE /api/admin/workspace-users/:id */
export async function handleAdminDeleteWorkspaceUser(
  env: Env,
  authUserId: string,
  targetUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const id = targetUserId.trim();
  if (!id) return json({ error: "缺少用户 ID" }, 400);
  if (id === authUserId) {
    return json({ error: "不能停用当前登录的管理员账号" }, 400);
  }

  try {
    const existing = await getWorkspaceUserById(env, id);
    await deleteWorkspaceUser(env, id);
    await recordOperationLog(env.DB, {
      actorUserId: authUserId,
      category: "user",
      action: "disable",
      targetKind: "user",
      targetId: id,
      targetLabel: formatUserLabel(existing, id),
      summary: `停用用户 ${formatUserLabel(existing, id)}`,
    });
    return json({ ok: true, userId: id, disabled: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /不存在/.test(msg) ? 404 : /创建人/.test(msg) ? 409 : 500;
    return json({ error: msg }, status);
  }
}

export async function handleAdminSetWorkspaceUserPassword(
  request: Request,
  env: Env,
  authUserId: string,
  targetUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const id = targetUserId.trim();
  if (!id) return json({ error: "缺少用户 ID" }, 400);

  let body: { password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const password = body.password ?? "";
  const pwErr = validatePassword(password);
  if (pwErr) return json({ error: pwErr }, 400);

  try {
    if (!(await getWorkspaceUserById(env, id))) {
      return json({ error: "用户不存在" }, 404);
    }
    const hashed = await hashPassword(password);
    await updateWorkspaceUserPassword(
      env,
      id,
      hashed.hash,
      hashed.salt,
      hashed.iterations,
    );
    const target = await getWorkspaceUserById(env, id);
    await recordOperationLog(env.DB, {
      actorUserId: authUserId,
      category: "user",
      action: "reset_password",
      targetKind: "user",
      targetId: id,
      targetLabel: formatUserLabel(target, id),
      summary: `重置 ${formatUserLabel(target, id)} 的密码`,
    });
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}

/** GET /api/admin/workspace-users/:id/project-memberships — 用户已加入/创建的项目及有效角色 */
export async function handleAdminGetUserProjectMemberships(
  env: Env,
  authUserId: string,
  targetUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const id = targetUserId.trim();
  if (!id) return json({ error: "缺少用户 ID" }, 400);
  if (!(await getWorkspaceUserById(env, id))) {
    return json({ error: "用户不存在" }, 404);
  }

  try {
    const projects = await listProjects(env);
    const overrides = await listMemberRoleOverridesForUser(env, id);
    const memberships: {
      projectId: string;
      projectName: string;
      openness: string;
      role: string;
      isCreator: boolean;
    }[] = [];

    for (const p of projects) {
      const isCreator = Boolean(p.createdBy && p.createdBy === id);
      const hasOverride = Boolean(overrides[p.id]);
      if (!isCreator && !hasOverride) continue;
      const role = await resolveProjectRole(env, id, p.id, p.createdBy);
      memberships.push({
        projectId: p.id,
        projectName: p.name,
        openness: p.openness,
        role,
        isCreator,
      });
    }

    memberships.sort((a, b) =>
      a.projectName.localeCompare(b.projectName, "zh"),
    );
    return json({ userId: id, memberships });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}

/** DELETE /api/admin/workspace-users/:id/project-memberships/:projectId */
export async function handleAdminDeleteUserProjectMembership(
  env: Env,
  authUserId: string,
  targetUserId: string,
  projectIdRaw: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const id = targetUserId.trim();
  const projectId = projectIdRaw.trim();
  if (!id || !projectId) return json({ error: "缺少用户或项目 ID" }, 400);
  if (!(await getWorkspaceUserById(env, id))) {
    return json({ error: "用户不存在" }, 404);
  }
  if (await isPlatformAdmin(env, id)) {
    return json({ error: "平台管理员权限不可在此修改" }, 400);
  }

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  const creator = (project.createdBy ?? "").trim();
  if (creator && creator === id) {
    return json({ error: "不能移除项目创建人" }, 400);
  }

  try {
    await deleteProjectMemberRole(env, projectId, id);
    const target = await getWorkspaceUserById(env, id);
    await recordOperationLog(env.DB, {
      actorUserId: authUserId,
      category: "permission",
      action: "remove_member",
      targetKind: "project",
      targetId: projectId,
      targetLabel: project.name,
      summary: `将 ${formatUserLabel(target, id)} 移出「${project.name}」`,
    });
    return json({ ok: true, userId: id, projectId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}
