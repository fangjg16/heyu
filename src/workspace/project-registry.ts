import type { WorkspaceProject } from "./projects";

let apiProjects: WorkspaceProject[] = [];
const apiProjectListeners = new Set<() => void>();

function notifyApiProjectListeners(): void {
  apiProjectListeners.forEach((fn) => fn());
}

export function subscribeApiProjects(listener: () => void): () => void {
  apiProjectListeners.add(listener);
  return () => apiProjectListeners.delete(listener);
}

export function setApiProjects(projects: WorkspaceProject[]): void {
  apiProjects = projects;
  notifyApiProjectListeners();
}

export function upsertApiProject(project: WorkspaceProject): void {
  const idx = apiProjects.findIndex((p) => p.id === project.id);
  if (idx >= 0) apiProjects[idx] = project;
  else apiProjects.push(project);
  notifyApiProjectListeners();
}

export function removeApiProject(projectId: string): void {
  apiProjects = apiProjects.filter((p) => p.id !== projectId);
  notifyApiProjectListeners();
}

/** 云端 API 项目列表 */
export function getMergedProjects(): WorkspaceProject[] {
  return [...apiProjects];
}

/** 云端登记项目（D1 proj-* 等） */
export function isCloudProject(project: WorkspaceProject): boolean {
  if (project.createdAt) return true;
  if (project.id.startsWith("proj-")) return true;
  return Boolean(project.createdBy);
}

function cloudSortKey(project: WorkspaceProject): number {
  const raw = project.createdAt || project.updatedAt || "";
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

/** 总览列表：按创建时间倒序 */
export function sortProjectsForOverview(projects: WorkspaceProject[]): WorkspaceProject[] {
  return [...projects].sort((a, b) => cloudSortKey(b) - cloudSortKey(a));
}

export function getMergedProjectById(id: string): WorkspaceProject | undefined {
  return apiProjects.find((p) => p.id === id);
}

export function getProjectById(id: string): WorkspaceProject | undefined {
  return getMergedProjectById(id);
}
