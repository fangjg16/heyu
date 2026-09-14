import type { WorkspaceRole } from "./types";

/** 由 API 拉取后写入：当前登录用户在各项目上的有效角色 */
let myRolesByProject: Record<string, WorkspaceRole> = {};
let myRolesReady = false;
let rolesVersion = 0;
const listeners = new Set<() => void>();

function emit(): void {
  rolesVersion += 1;
  for (const listener of listeners) listener();
}

export function setMyProjectRoles(map: Record<string, WorkspaceRole>): void {
  myRolesByProject = { ...map };
  myRolesReady = true;
  emit();
}

export function patchMyProjectRole(projectId: string, role: WorkspaceRole): void {
  myRolesByProject = { ...myRolesByProject, [projectId]: role };
  emit();
}

export function clearMyProjectRoles(): void {
  myRolesByProject = {};
  myRolesReady = false;
  emit();
}

/** 角色请求失败时：保留已有表，只标「这轮已经问过」，避免把 Core 清成未加入 */
export function markMyProjectRolesReady(): void {
  myRolesReady = true;
  emit();
}

export function areMyProjectRolesReady(): boolean {
  return myRolesReady;
}

export function readAllCachedProjectRoles(): Record<string, WorkspaceRole> {
  return { ...myRolesByProject };
}

export function readCachedProjectRole(projectId: string): WorkspaceRole | null {
  return myRolesByProject[projectId] ?? null;
}

export function getProjectRolesVersion(): number {
  return rolesVersion;
}

/** 供 React 订阅：角色缓存变更时触发重渲染 */
export function subscribeProjectRoles(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
