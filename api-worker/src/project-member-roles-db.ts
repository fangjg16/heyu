import type { AppDatabase } from "./app-database";
import type { WorkspaceRole } from "./workspace-roles";
import {
  getDefaultRoleForUser,
  isKnownWorkspaceUser,
  listActiveWorkspaceUsers,
} from "./workspace-users-db";

type Env = { DB: AppDatabase };

export type ProjectMemberRoleRow = {
  project_id: string;
  user_id: string;
  role: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at?: string | null;
};

const ASSIGNABLE_ROLES: WorkspaceRole[] = ["guest", "low", "mid", "core"];

export function isAssignableProjectRole(role: string): role is WorkspaceRole {
  return ASSIGNABLE_ROLES.includes(role as WorkspaceRole);
}

function isMissingDeletedAt(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Unknown column ['`]?deleted_at['`]?|no such column:\s*deleted_at/i.test(msg);
}

function parseRole(raw: string): WorkspaceRole | null {
  const role = raw as WorkspaceRole;
  if (
    role === "admin" ||
    role === "core" ||
    role === "mid" ||
    role === "low" ||
    role === "guest"
  ) {
    return role;
  }
  return null;
}

export async function getProjectMemberRoleOverride(
  env: Env,
  projectId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT role FROM project_member_roles
       WHERE project_id = ? AND user_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(projectId, userId.trim())
      .first<{ role: string }>();
    if (!row?.role) return null;
    return parseRole(row.role);
  } catch (e) {
    if (!isMissingDeletedAt(e)) throw e;
    const row = await env.DB.prepare(
      `SELECT role FROM project_member_roles WHERE project_id = ? AND user_id = ?`,
    )
      .bind(projectId, userId.trim())
      .first<{ role: string }>();
    if (!row?.role) return null;
    return parseRole(row.role);
  }
}

export async function listProjectMemberRoleOverrides(
  env: Env,
  projectId: string,
): Promise<Record<string, WorkspaceRole>> {
  let results: { user_id: string; role: string }[] | null = null;
  try {
    const q = await env.DB.prepare(
      `SELECT user_id, role FROM project_member_roles
       WHERE project_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(projectId)
      .all<{ user_id: string; role: string }>();
    results = q.results ?? [];
  } catch (e) {
    if (!isMissingDeletedAt(e)) throw e;
    const q = await env.DB.prepare(
      `SELECT user_id, role FROM project_member_roles WHERE project_id = ?`,
    )
      .bind(projectId)
      .all<{ user_id: string; role: string }>();
    results = q.results ?? [];
  }

  const map: Record<string, WorkspaceRole> = {};
  for (const row of results ?? []) {
    const role = parseRole(row.role);
    if (role) map[row.user_id] = role;
  }
  return map;
}

/** 某用户在各项目上的成员角色覆盖（不含仅创建人、未写入表的情形） */
export async function listMemberRoleOverridesForUser(
  env: Env,
  userId: string,
): Promise<Record<string, WorkspaceRole>> {
  let results: { project_id: string; role: string }[] | null = null;
  try {
    const q = await env.DB.prepare(
      `SELECT project_id, role FROM project_member_roles
       WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(userId.trim())
      .all<{ project_id: string; role: string }>();
    results = q.results ?? [];
  } catch (e) {
    if (!isMissingDeletedAt(e)) throw e;
    const q = await env.DB.prepare(
      `SELECT project_id, role FROM project_member_roles WHERE user_id = ?`,
    )
      .bind(userId.trim())
      .all<{ project_id: string; role: string }>();
    results = q.results ?? [];
  }

  const map: Record<string, WorkspaceRole> = {};
  for (const row of results ?? []) {
    const role = parseRole(row.role);
    if (role) map[row.project_id] = role;
  }
  return map;
}

export async function upsertProjectMemberRole(
  env: Env,
  projectId: string,
  userId: string,
  role: WorkspaceRole,
  updatedBy: string,
): Promise<void> {
  const t = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO project_member_roles (project_id, user_id, role, updated_at, updated_by, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(project_id, user_id) DO UPDATE SET
         role = excluded.role,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         deleted_at = NULL`,
    )
      .bind(projectId, userId.trim(), role, t, updatedBy)
      .run();
  } catch (e) {
    if (!isMissingDeletedAt(e)) throw e;
    await env.DB.prepare(
      `INSERT INTO project_member_roles (project_id, user_id, role, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, user_id) DO UPDATE SET
         role = excluded.role,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
      .bind(projectId, userId.trim(), role, t, updatedBy)
      .run();
  }
}

/** 软移除项目下全部成员（保留行） */
export async function deleteProjectMemberRolesForProject(
  env: Env,
  projectId: string,
): Promise<void> {
  const t = new Date().toISOString();
  try {
    await env.DB.prepare(
      `UPDATE project_member_roles
       SET deleted_at = ?, updated_at = ?
       WHERE project_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(t, t, projectId)
      .run();
  } catch (e) {
    if (!isMissingDeletedAt(e)) throw e;
    throw new Error(
      "软删除列未迁移（缺少 project_member_roles.deleted_at），请先执行 migration 0013",
    );
  }
}

/** 软移除单个成员；再次 upsert 可恢复 */
export async function deleteProjectMemberRole(
  env: Env,
  projectId: string,
  userId: string,
): Promise<void> {
  const t = new Date().toISOString();
  try {
    await env.DB.prepare(
      `UPDATE project_member_roles
       SET deleted_at = ?, updated_at = ?
       WHERE project_id = ? AND user_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(t, t, projectId, userId.trim())
      .run();
  } catch (e) {
    if (!isMissingDeletedAt(e)) throw e;
    throw new Error(
      "软删除列未迁移（缺少 project_member_roles.deleted_at），请先执行 migration 0013",
    );
  }
}

export async function seedProjectMemberRoles(
  env: Env,
  projectId: string,
  createdBy: string | null,
  participants: { userId: string; role: WorkspaceRole }[],
  updatedBy: string,
): Promise<void> {
  const creator = (createdBy ?? "").trim();
  const seen = new Set<string>();

  if (creator) {
    await upsertProjectMemberRole(env, projectId, creator, "core", updatedBy);
    seen.add(creator);
  }

  for (const p of participants) {
    const uid = p.userId.trim();
    if (!uid || !(await isKnownWorkspaceUser(env, uid)) || seen.has(uid)) continue;
    const role = isAssignableProjectRole(p.role) ? p.role : "mid";
    await upsertProjectMemberRole(env, projectId, uid, role, updatedBy);
    seen.add(uid);
  }
}

export async function listKnownWorkspaceUsers(
  env: Env,
): Promise<{ userId: string; defaultRole: WorkspaceRole; displayName: string; isPlatformAdmin: boolean }[]> {
  const users = await listActiveWorkspaceUsers(env);
  return users.map((u) => ({
    userId: u.id,
    defaultRole: u.defaultRole,
    displayName: u.displayName,
    isPlatformAdmin: u.isPlatformAdmin,
  }));
}

export async function resolveDefaultRole(
  env: Env,
  userId: string,
): Promise<WorkspaceRole> {
  return getDefaultRoleForUser(env, userId);
}
