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

/** 项目创建人在本项目内至少为 Admin（项目权限，不是平台管理员）。 */
export function roleWithCreatorFloor(
  userId: string,
  createdBy: string | null | undefined,
  role: WorkspaceRole | null | undefined,
): WorkspaceRole {
  const uid = userId.trim();
  const creator = (createdBy ?? "").trim();
  if (creator && creator === uid) {
    return role ? higherRole(role, "admin") : "admin";
  }
  return role ?? "guest";
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
 * 仅平台管理员 / 项目创建人 / project_member_roles 成员有非 guest 权限；
 * 项目内权限看项目成员，不再按账号级角色自动把人拉进项目。
 * 项目创建人在本项目内为 Admin（项目权限，不是平台管理员）。
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
  return roleWithCreatorFloor(uid, creator, override);
}

/** 上传/覆盖项目知识网络正式版：仅 admin（审核、发布、回滚） */
export function roleCanPublishKnowledgeNetwork(role: WorkspaceRole): boolean {
  return role === "admin";
}

/** 更新知识网络（生成草案 / 改写）：admin / core，发布须 admin */
export function roleCanUpdateKnowledgeNetwork(role: WorkspaceRole): boolean {
  return role === "admin" || role === "core";
}

/** 项目上传资料：admin / core 可上传、查看、移动、删除 */
export function roleCanManageProjectUploads(role: WorkspaceRole): boolean {
  return role === "admin" || role === "core";
}

/** 对话上传：仅 admin 可看全员；其他人只看自己的 */
export function roleCanViewAllSessionUploads(role: WorkspaceRole): boolean {
  return role === "admin";
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

/** 生成知识网络草案：admin / core */
export async function canUpdateProjectKnowledgeNetwork(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return roleCanUpdateKnowledgeNetwork(role);
}

/** 发布/回滚知识网络正式版：仅 admin */
export async function canPublishProjectKnowledgeNetwork(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return roleCanPublishKnowledgeNetwork(role);
}

/** 项目上传 CRUD：admin / core */
export async function canManageProjectUploads(
  env: RoleEnv,
  userId: string,
  projectId: string,
  createdBy?: string | null,
): Promise<boolean> {
  const role = await resolveProjectRole(env, userId, projectId, createdBy);
  return roleCanManageProjectUploads(role);
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
