/**
 * @deprecated 用户目录已迁入 MySQL workspace_users；保留空壳避免旧 import 崩
 */

export const KNOWN_WORKSPACE_USER_IDS: string[] = [];

export function isKnownWorkspaceUser(_userId: string): boolean {
  return false;
}
