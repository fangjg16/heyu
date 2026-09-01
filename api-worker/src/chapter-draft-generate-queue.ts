/**
 * 章节草案 LLM 作业门闩。
 * 「更新全部」绝不能由浏览器并行打满模型；同一进程内最多同时跑 CHAPTER_GENERATE_CONCURRENCY 路。
 */

export const CHAPTER_GENERATE_CONCURRENCY = 2;

/** 资料包 Markdown 总文件必须按阶段串行，后一层要读前一层 */
export const FILE_GENERATE_CONCURRENCY = 1;

/** 整次草案没有任何 item 更新超过该时间，才把仍 pending 的章标失败（排队等待不算超时） */
export const DRAFT_RUN_IDLE_STALE_MS = 20 * 60 * 1000;

const inFlight = new Set<string>();
const runProcessors = new Map<string, Promise<void>>();
let active = 0;
const waiters: Array<() => void> = [];

export function draftGenerateJobKey(runId: string, sectionId: string): string {
  return `${runId}:${sectionId}`;
}

export function isDraftGenerateInFlight(key: string): boolean {
  return inFlight.has(key);
}

export function tryClaimDraftGenerateJob(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

export function releaseDraftGenerateJob(key: string): void {
  inFlight.delete(key);
}

/** 同一 run 只跑一个排队循环；重复 kick 会接到正在跑的 Promise 上。 */
export function startDraftRunProcessor(
  runId: string,
  fn: () => Promise<void>,
): Promise<void> {
  const existing = runProcessors.get(runId);
  if (existing) return existing;
  const started = fn().finally(() => {
    if (runProcessors.get(runId) === started) {
      runProcessors.delete(runId);
    }
  });
  runProcessors.set(runId, started);
  return started;
}

export async function withChapterGenerateGate<T>(
  fn: () => Promise<T>,
): Promise<T> {
  await acquireChapterGenerateSlot();
  try {
    return await fn();
  } finally {
    releaseChapterGenerateSlot();
  }
}

function acquireChapterGenerateSlot(): Promise<void> {
  if (active < CHAPTER_GENERATE_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function releaseChapterGenerateSlot(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

export function shouldFailStalePendingItems(
  items: Array<{ status: string; updatedAt: string }>,
  nowMs: number,
  staleMs: number = DRAFT_RUN_IDLE_STALE_MS,
): boolean {
  const pendingOrRevising = items.some(
    (i) => i.status === "pending" || i.status === "revising",
  );
  if (!pendingOrRevising) return false;
  let newest = 0;
  for (const item of items) {
    const t = Date.parse(item.updatedAt);
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  if (newest === 0) return true;
  return nowMs - newest >= staleMs;
}
