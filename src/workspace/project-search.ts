import type { WorkspaceProject } from "@/workspace/projects";
import { getUserById } from "@/workspace/workspace-users";

function prettyName(displayName: string): string {
  return displayName.replace(/([a-z])([A-Z])/g, "$1 $2").trim() || displayName;
}

/** 项目库关键词匹配：名称、分类、阶段、摘要、负责人 */
export function projectMatchesQuery(
  project: WorkspaceProject,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const ownerId = (project.createdBy ?? "").trim();
  const ownerUser = ownerId ? getUserById(ownerId) : undefined;
  const ownerName = ownerUser?.displayName
    ? prettyName(ownerUser.displayName)
    : ownerId;

  const haystack = [
    project.name,
    project.category,
    project.phase,
    project.summary,
    project.guestSummary,
    ownerName,
    ownerId,
    project.id,
  ]
    .join("\n")
    .toLowerCase();

  return q.split(/\s+/u).every((token) => token && haystack.includes(token));
}
