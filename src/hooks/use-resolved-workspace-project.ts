import { useEffect, useState } from "react";
import { fetchProjectByIdFromApi } from "@/lib/project-api";
import {
  getMergedProjects,
  rememberProjectName,
  subscribeApiProjects,
  upsertApiProject,
} from "@/workspace/project-registry";
import type { WorkspaceProject } from "@/workspace/projects";

const inflight = new Map<string, Promise<WorkspaceProject | null>>();

function loadProjectById(projectId: string): Promise<WorkspaceProject | null> {
  const existing = inflight.get(projectId);
  if (existing) return existing;
  const req = fetchProjectByIdFromApi(projectId).finally(() => {
    inflight.delete(projectId);
  });
  inflight.set(projectId, req);
  return req;
}

/** 直达/刷新时内存列表可能还空，补拉当前项目并在缓存更新时重渲染。 */
export function useResolvedWorkspaceProject(
  projectId?: string,
): WorkspaceProject | undefined {
  const [, setTick] = useState(0);

  useEffect(() => subscribeApiProjects(() => setTick((n) => n + 1)), []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void loadProjectById(projectId)
      .then((row) => {
        if (cancelled || !row) return;
        upsertApiProject(row);
        rememberProjectName(row.id, row.name);
      })
      .catch(() => {
        /* 顶栏没有名称时显示「项目」，不阻断正文 */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return undefined;
  return getMergedProjects().find((p) => p.id === projectId);
}
