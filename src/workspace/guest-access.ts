/**
 * 前端项目列表过滤。
 * GET /api/projects 会带上已加入项目以及全开放广场项目；
 * 总览「进行中的项目」、对话入口只用已加入列表，广场仍走目录接口。
 */

import {
  getProjectRole,
  isIssuerOnlyUser,
} from "./workspace-users";

export function filterProjectsForUser<
  T extends { id: string; createdBy?: string | null },
>(userId: string, projects: T[]): T[] {
  const uid = (userId ?? "").trim();
  if (!uid || !isIssuerOnlyUser(uid)) return projects;
  return filterMemberProjectsForUser(uid, projects);
}

/** 已加入的项目（不含广场访客可见、尚未入组的） */
export function filterMemberProjectsForUser<
  T extends { id: string; createdBy?: string | null },
>(userId: string, projects: T[]): T[] {
  const uid = (userId ?? "").trim();
  if (!uid) return [];
  return projects.filter(
    (p) => getProjectRole(uid, p.id, p.createdBy) !== "guest",
  );
}
