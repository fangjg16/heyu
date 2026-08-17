/** 前端项目列表过滤（目录可见性由 API 按成员关系统一返回） */

import {
  getProjectRole,
  isIssuerOnlyUser,
} from "./workspace-users";

export function filterProjectsForUser<
  T extends { id: string; createdBy?: string | null },
>(userId: string, projects: T[]): T[] {
  const uid = (userId ?? "").trim();
  if (!uid || !isIssuerOnlyUser(uid)) return projects;
  return projects.filter(
    (p) => getProjectRole(uid, p.id, p.createdBy) !== "guest",
  );
}
