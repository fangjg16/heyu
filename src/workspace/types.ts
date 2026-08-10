/** 项目内权限（同一人可在不同项目不同级别） */
export type WorkspaceRole =
  | "admin"
  | "core"
  | "mid"
  | "low"
  | "guest";

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
