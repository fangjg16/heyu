/** 前端项目列表过滤（目录可见性由 API 按成员关系统一返回） */

export function filterProjectsForUser<T extends { id: string }>(
  _userId: string,
  projects: T[],
): T[] {
  return projects;
}
