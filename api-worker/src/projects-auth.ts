import type { AppDatabase } from "./app-database";
import type { ProjectJson } from "./projects-db";
import {
  isPlatformAdminUser,
} from "./workspace-users-db";

type Env = { DB: AppDatabase };

/** 平台管理员：读 workspace_users.is_platform_admin */
export async function isPlatformAdmin(
  env: Env,
  userId: string | null | undefined,
): Promise<boolean> {
  return isPlatformAdminUser(env, userId);
}

export async function canManageProjectRecord(
  env: Env,
  project: ProjectJson,
  userId: string | null,
): Promise<boolean> {
  if (!userId) return false;
  if (await isPlatformAdmin(env, userId)) return true;
  if (!project.createdBy) return false;
  return project.createdBy === userId;
}

export async function listMemberProjectIdsForUser(
  env: Env,
  userId: string,
): Promise<Set<string>> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT project_id FROM project_member_roles
       WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(userId.trim())
      .all<{ project_id: string }>();
    return new Set((results ?? []).map((r) => r.project_id));
  } catch {
    try {
      const { results } = await env.DB.prepare(
        `SELECT project_id FROM project_member_roles WHERE user_id = ?`,
      )
        .bind(userId.trim())
        .all<{ project_id: string }>();
      return new Set((results ?? []).map((r) => r.project_id));
    } catch {
      return new Set();
    }
  }
}

export function isProjectMember(
  project: ProjectJson,
  userId: string,
  memberIds: Set<string>,
): boolean {
  if (project.createdBy && project.createdBy === userId) return true;
  return memberIds.has(project.id);
}

/** 是否为项目成员（创建人或已写入 project_member_roles） */
export async function isUserProjectMember(
  env: Env,
  project: ProjectJson,
  userId: string,
): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  const memberIds = await listMemberProjectIdsForUser(env, uid);
  return isProjectMember(project, uid, memberIds);
}

function isDirectoryDiscoverable(openness: string | null | undefined): boolean {
  const o = String(openness ?? "").trim().toLowerCase();
  return o === "partial" || o === "public" || o === "";
}

/**
 * 项目总览目录可见性：
 * 1. 平台管理员：全部
 * 2. 登录用户：已加入/自建，或半开放（partial/public）可发现
 * 3. 未登录：非 invite
 */
export async function filterProjectsForDirectory(
  env: Env,
  userId: string | null,
  projects: ProjectJson[],
): Promise<ProjectJson[]> {
  if (!userId) {
    return projects.filter((p) => p.openness !== "invite");
  }
  if (await isPlatformAdmin(env, userId)) return projects;

  const uid = userId.trim();
  const memberIds = await listMemberProjectIdsForUser(env, uid);
  return projects.filter(
    (p) =>
      isProjectMember(p, uid, memberIds) || isDirectoryDiscoverable(p.openness),
  );
}

export async function canSeeProjectInDirectory(
  env: Env,
  project: ProjectJson,
  userId: string | null,
): Promise<boolean> {
  const [visible] = await filterProjectsForDirectory(env, userId, [project]);
  return Boolean(visible);
}
