const KEY = "heyu-kn-watched-draft-runs";

function readIds(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids.slice(0, 20)));
  } catch {
    /* ignore quota */
  }
}

export function watchDraftRun(runId: string): void {
  if (!runId) return;
  const ids = readIds();
  if (ids.includes(runId)) return;
  writeIds([runId, ...ids]);
}

export function unwatchDraftRun(runId: string): void {
  if (!runId) return;
  writeIds(readIds().filter((id) => id !== runId));
}

export function isWatchedDraftRun(runId: string): boolean {
  return readIds().includes(runId);
}
