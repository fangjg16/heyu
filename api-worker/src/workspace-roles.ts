import type { AppDatabase } from "./app-database";
import { getProjectMemberRoleOverride } from "./project-member-roles-db";
import { isPlatformAdminUser } from "./workspace-users-db";

export type WorkspaceRole =
  | "admin"
  | "core"
  | "mid"
  | "low"
  | "issuer"
  | "guest";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  guest: 0,
  issuer: 1,
  low: 2,
  mid: 3,
  core: 4,
  admin: 5,
};

function higherRole(a: WorkspaceRole, b: WorkspaceRole): WorkspaceRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

type RoleEnv = { DB: AppDatabase };

export function isInvestorRole(role: WorkspaceRole): boolean {
  return role === "admin" || role === "core" || role === "mid" || role === "low";
}

export function isIssuerRole(role: WorkspaceRole): boolean {
  return role === "issuer";
}

/**
 * 解析用户在项目上的有效角色。
 * 仅平台 Admin / 创建人 / project_member_roles 成员有非 guest 权限；
 * 不再用账号 default_role 自动把所有人拉进项目。
 */
export async function resolveProjectRole(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<WorkspaceRole> {
  const uid = userId.trim();
  if (!uid) return "guest";
  if (await isPlatformAdminUser(env, uid)) return "admin";

  const creator = (createdBy ?? "").trim();
  const override = await getProjectMemberRoleOverride(env, projectId, uid);

  if (override) {
    let role: WorkspaceRole = override;
    if (creator && creator === uid) {
      role = higherRole(role, "core");
    }
    return role;
  }

  if (creator && creator === uid) return "core";
  return "guest";
}

export async function canViewProjectKnowledgeNetwork(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  const role = await resolveProjectRole(env, uid, projectId, createdBy);
  // 项目方不得读取投资判断 / 知识网络；广场访客仍可看公开概览
  if (isIssuerRole(role)) return false;
  return true;
}

/** 投资团队列出项目资料包；项目方走协作文件 API */
export async function canListProjectFiles(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return isInvestorRole(role);
}

/** 上传/覆盖项目知识网络 HTML：admin / core（创建人自动为 core） */
export async function canPublishProjectKnowledgeNetwork(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return role === "admin" || role === "core";
}

/** 下载项目资料包原文件：admin / core / 项目创建人 */
export async function canDownloadProjectFile(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;
  const role = await resolveProjectRole(env, uid, projectId, createdBy);
  if (role === "admin" || role === "core") return true;
  const creator = (createdBy ?? "").trim();
  return Boolean(creator && creator === uid);
}

export async function canEnterProjectChat(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return isInvestorRole(role);
}

export async function canManageProjectCollab(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return role === "admin" || role === "core";
}

export async function canAccessProjectCollab(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return isIssuerRole(role) || isInvestorRole(role);
}
