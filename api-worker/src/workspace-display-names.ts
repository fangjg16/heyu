import type { AppDatabase } from "./app-database";

/** 同步展示名缓存（启动后首次查询填充；无记录时回退 userId） */
const displayNameCache = new Map<string, string>();

export function workspaceUserDisplayName(userId: string): string {
  const id = userId.trim();
  return displayNameCache.get(id) ?? id;
}

export function setWorkspaceUserDisplayNameCache(
  entries: { id: string; displayName: string }[],
): void {
  for (const e of entries) {
    displayNameCache.set(e.id.trim(), e.displayName.trim() || e.id);
  }
}

export async function refreshWorkspaceDisplayNameCache(env: {
  DB: AppDatabase;
}): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, display_name FROM workspace_users WHERE status = 'active'`,
  ).all<{ id: string; display_name: string }>();
  setWorkspaceUserDisplayNameCache(
    (results ?? []).map((r) => ({ id: r.id, displayName: r.display_name })),
  );
}
