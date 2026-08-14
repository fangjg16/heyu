/** 项目内权限（同一人可在不同项目不同级别）
 * mid=Advanced 进阶级：枚举预留，本阶段不在 UI 展示/不可新分配。
 */
export type WorkspaceRole =
  | "admin"
  | "core"
  | "mid"
  | "low"
  | "guest";

/** 加入项目时可赋予的档位（不含 Guest / Advanced） */
export const PROJECT_ASSIGNABLE_ROLES: WorkspaceRole[] = [
  "admin",
  "core",
  "low",
];

export type WorkspaceUser = {
  id: string;
  displayName: string;
  orgTitle: string;
  avatarChar: string;
  avatarClass: string;
  /** 平台管理员（管理中枢 / 全项目） */
  isPlatformAdmin?: boolean;
  /** 账号默认角色（用于 Guest 目录过滤等） */
  defaultRole?: WorkspaceRole | string;
};

export const SESSION_KEY = "fo-workspace-session";
