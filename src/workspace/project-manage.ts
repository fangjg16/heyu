import type { WorkspaceProject } from "./projects";
import { getProjectRole } from "./workspace-users";

/** 写入 D1 的用户自建项目（id 以 proj- 开头） */
export function isPersistedUserProject(project: WorkspaceProject): boolean {
  return project.id.startsWith("proj-");
}

export function formatProjectCreatedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export function canUserManageProjectMetadata(
  userId: string,
  project: WorkspaceProject,
): boolean {
  if (!isPersistedUserProject(project)) return false;
  if (getProjectRole(userId, project.id, project.createdBy) === "admin") return true;
  return Boolean(project.createdBy && project.createdBy === userId);
}

/** 权限管理：平台管理员、项目创建人、或本项目项目管理员 */
export function canManageProjectPermissions(
  userId: string,
  project: WorkspaceProject,
): boolean {
  const uid = (userId ?? "").trim();
  if (!uid) return false;
  const creator = (project.createdBy ?? "").trim();
  if (creator && creator === uid) return true;
  return getProjectRole(uid, project.id, project.createdBy) === "admin";
}

/** 下载项目资料原文件：仅项目 Admin / Core（创建人在本项目已是 Admin） */
export function canDownloadProjectMaterials(
  userId: string,
  project: Pick<WorkspaceProject, "id" | "createdBy">,
): boolean {
  const uid = userId.trim();
  if (!uid) return false;
  const role = getProjectRole(uid, project.id, project.createdBy);
  return role === "admin" || role === "core";
}

/** 项目上传：Admin / Core 可上传、移动、删除 */
export function canManageProjectUploads(
  userId: string,
  project: Pick<WorkspaceProject, "id" | "createdBy">,
): boolean {
  const uid = userId.trim();
  if (!uid) return false;
  const role = getProjectRole(uid, project.id, project.createdBy);
  return role === "admin" || role === "core";
}

/** 生成知识网络草案：Admin / Core */
export function canUpdateProjectKnowledgeNetwork(
  userId: string,
  project: Pick<WorkspaceProject, "id" | "createdBy"> | null | undefined,
): boolean {
  const uid = userId.trim();
  if (!uid || !project?.id) return false;
  const role = getProjectRole(uid, project.id, project.createdBy);
  return role === "admin" || role === "core";
}

/** 审核/发布/回滚知识网络正式版：仅 Admin（与 Worker 对齐） */
export function canPublishProjectKnowledgeNetwork(
  userId: string,
  project: Pick<WorkspaceProject, "id" | "createdBy"> | null | undefined,
): boolean {
  const uid = userId.trim();
  if (!uid || !project?.id) return false;
  const role = getProjectRole(uid, project.id, project.createdBy);
  return role === "admin";
}
