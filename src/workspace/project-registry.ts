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

/** 只补名称，不覆盖已有项目的其它字段。 */
export function rememberProjectName(projectId: string, name: string): void {
  const trimmed = name.trim();
  if (!projectId || !trimmed) return;
  if (trimmed === projectId) return;
  if (/^proj-[a-z0-9]+$/i.test(trimmed)) return;
  const existing = getMergedProjectById(projectId);
  if (existing?.name === trimmed) return;
  if (existing) {
    upsertApiProject({ ...existing, name: trimmed });
    return;
  }
  upsertApiProject({
    id: projectId,
    name: trimmed,
    category: "未分类",
    phase: "进行中",
    summary: "",
    guestSummary: "",
  });
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
