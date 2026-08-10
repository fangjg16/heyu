/**
 * @deprecated 默认角色已迁入 MySQL workspace_users；保留空壳避免旧 import 崩
 */
import type { WorkspaceRole } from "./workspace-roles";

export const DEFAULT_ROLE_BY_USER: Record<string, WorkspaceRole> = {};
export const KNOWN_WORKSPACE_USER_IDS: string[] = [];

export function isKnownWorkspaceUser(_userId: string): boolean {
  return false;
}
