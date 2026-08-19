import type { WorkspaceRole, WorkspaceUser } from "./types";
import { readAllCachedProjectRoles, readCachedProjectRole } from "./project-role-cache";
import { loadSessionUserProfile } from "./session";

export type { WorkspaceUser };

let userCache: Record<string, WorkspaceUser> = {};

export function cacheWorkspaceUsers(users: WorkspaceUser[]): void {
  const next: typeof userCache = {};
  for (const u of users) next[u.id] = u;
  userCache = next;
}

export function setCachedUserProfile(user: WorkspaceUser): void {
  userCache = { ...userCache, [user.id]: user };
}

export function getUserById(id: string | null): WorkspaceUser | undefined {
  if (!id) return undefined;
  if (userCache[id]) return userCache[id];
  const session = loadSessionUserProfile();
  if (session?.id === id) {
    return {
      id: session.id,
      displayName: session.displayName ?? id,
      orgTitle: session.orgTitle ?? "",
      avatarChar: session.avatarChar ?? "?",
      avatarClass: session.avatarClass ?? "bg-slate-300 text-slate-800 shadow-sm",
      avatarUrl: session.avatarUrl ?? "",
      isPlatformAdmin: session.isPlatformAdmin,
    };
  }
  return undefined;
}

/** 参与人选择等：返回已缓存的用户目录 */
export function listCachedWorkspaceUsers(): WorkspaceUser[] {
  return Object.values(userCache);
}

export function isPlatformAdminUser(userId: string | null | undefined): boolean {
  const uid = (userId ?? "").trim();
  if (!uid) return false;
  if (userCache[uid]?.isPlatformAdmin) return true;
  const session = loadSessionUserProfile();
  return Boolean(session?.id === uid && session.isPlatformAdmin);
}

/** 尚未加入任何项目（侧栏「未加入项目」） */
export function isAccountGuestUser(userId: string | null | undefined): boolean {
  const uid = (userId ?? "").trim();
  if (!uid || isPlatformAdminUser(uid)) return false;
  const joined = Object.values(readAllCachedProjectRoles()).filter(
    (r) => r && r !== "guest",
  );
  return joined.length === 0;
}

export function getProjectRole(
  userId: string,
  projectId: string,
  createdBy?: string | null,
): WorkspaceRole {
  const uid = userId.trim();
  if (!uid) return "guest";

  if (isPlatformAdminUser(uid)) return "admin";

  const creator = (createdBy ?? "").trim();
  /** 项目创建人：本项目 Admin（不是平台管理员） */
  if (creator && creator === uid) return "admin";

  const cached = readCachedProjectRole(projectId);
  if (cached) return cached;

  // 无项目成员记录时按未加入；勿用账号字段误当成已入组
  return "guest";
}

/** 已加入项目（三档权限或项目协作方）。guest 表示未加入，不是第四档权限。 */
export function isJoinedProjectRole(role: WorkspaceRole): boolean {
  return role !== "guest";
}

/** 对话区与表格的展示档位 */
export type UiTier = "full" | "mid" | "low";

export function workspaceRoleToUiTier(role: WorkspaceRole): UiTier {
  if (role === "admin" || role === "core") return "full";
  if (role === "mid") return "mid";
  return "low";
}

export function roleLabelForProject(role: WorkspaceRole): string {
  switch (role) {
    case "admin":
      return "Admin 项目管理员";
    case "core":
      return "Core 核心级";
    case "mid":
      return "Advanced 进阶级";
    case "low":
      return "Basic 基础级";
    case "issuer":
      return "项目协作方";
    case "guest":
      return "未加入";
    default:
      return role;
  }
}

/** 权限下拉：默认 Admin/Core/Basic；若成员仍是 mid 则临时保留以便改档 */
export function projectRoleSelectOptions(
  current?: WorkspaceRole | null,
): WorkspaceRole[] {
  if (current === "mid") return ["admin", "core", "mid", "low", "issuer"];
  return ["admin", "core", "low", "issuer"];
}

export function isInvestorRole(role: WorkspaceRole): boolean {
  return role === "admin" || role === "core" || role === "mid" || role === "low";
}

export function isIssuerRole(role: WorkspaceRole): boolean {
  return role === "issuer";
}

/** 发给项目协作方 / 改措辞发布：仅项目管理员与 Core */
export function canPublishToIssuer(role: WorkspaceRole): boolean {
  return role === "admin" || role === "core";
}

/** 项目协作方是项目内身份，不是账号级开关；广场对已登录账号开放 */
export function isIssuerOnlyUser(_userId: string | null | undefined): boolean {
  return false;
}

/** 侧栏对话：看项目成员角色，未加入投资档则不能进对话 */
export function canOpenWorkspaceChat(userId: string | null | undefined): boolean {
  const uid = (userId ?? "").trim();
  if (!uid) return false;
  if (isPlatformAdminUser(uid)) return true;
  if (isIssuerOnlyUser(uid)) return false;
  const roles = Object.values(readAllCachedProjectRoles());
  if (roles.some((r) => isInvestorRole(r))) return true;
  if (roles.length > 0) return false;
  return false;
}

export function canEnterChat(role: WorkspaceRole): boolean {
  return isInvestorRole(role);
}

export function projectEntryPath(
  projectId: string,
  role: WorkspaceRole,
): string {
  if (role === "issuer") return `/app/collab/${projectId}`;
  return `/app/projects/${projectId}/overview`;
}
