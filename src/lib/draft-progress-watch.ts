const KEY = "heyu-kn-watched-draft-runs";
const CLOCK_PREFIX = "heyu-kn-draft-clock:";

/** 本次点击更新/重排的计时原点，不沿用整条草案第一次创建时间。 */
export function markDraftRunClock(runId: string, startedAt = Date.now()): void {
  if (!runId) return;
  try {
    sessionStorage.setItem(`${CLOCK_PREFIX}${runId}`, String(startedAt));
  } catch {
    /* ignore quota */
  }
}

export function draftRunElapsedMs(runId: string): number {
  if (!runId) return 0;
  try {
    const raw = sessionStorage.getItem(`${CLOCK_PREFIX}${runId}`);
    const origin = raw ? Number(raw) : NaN;
    if (Number.isFinite(origin) && origin > 0) {
      return Math.max(0, Date.now() - origin);
    }
    const now = Date.now();
    sessionStorage.setItem(`${CLOCK_PREFIX}${runId}`, String(now));
    return 0;
  } catch {
    return 0;
  }
}

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
