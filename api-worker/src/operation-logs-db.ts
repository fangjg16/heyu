import type { AppDatabase } from "./app-database";

export type OperationCategory =
  | "user"
  | "permission"
  | "join"
  | "llm"
  | "skill"
  | "file";

export type PlatformOperationLog = {
  id: string;
  actorUserId: string;
  category: OperationCategory;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string;
  createdAt: string;
};

type OpLogRow = {
  id: string;
  actor_user_id: string;
  category: string;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  target_label: string | null;
  summary: string;
  created_at: string;
};

const CATEGORIES = new Set<OperationCategory>([
  "user",
  "permission",
  "join",
  "llm",
  "skill",
  "file",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function newLogId(): string {
  return `opl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function asCategory(raw: string): OperationCategory {
  return CATEGORIES.has(raw as OperationCategory)
    ? (raw as OperationCategory)
    : "user";
}

function rowToLog(r: OpLogRow): PlatformOperationLog {
  return {
    id: r.id,
    actorUserId: r.actor_user_id,
    category: asCategory(r.category),
    action: r.action,
    targetKind: r.target_kind,
    targetId: r.target_id,
    targetLabel: r.target_label,
    summary: r.summary,
    createdAt: r.created_at,
  };
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/gu, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatUserLabel(
  row: { display_name?: string | null; username?: string | null } | null | undefined,
  fallback: string,
): string {
  return row?.display_name?.trim() || row?.username?.trim() || fallback;
}

function isMissingTable(msg: string): boolean {
  return (
    /no such table:\s*platform_operation_logs/i.test(msg) ||
    /Unknown table ['`]?platform_operation_logs['`]?/i.test(msg)
  );
}

/** 写入失败（含表未迁移）不抛给主流程 */
export async function recordOperationLog(
  db: AppDatabase,
  input: {
    actorUserId: string;
    category: OperationCategory;
    action: string;
    targetKind?: string | null;
    targetId?: string | null;
    targetLabel?: string | null;
    summary: string;
  },
): Promise<void> {
  const actor = input.actorUserId.trim();
  const summary = clip(input.summary, 1024);
  if (!actor || !summary) return;
  try {
    await db
      .prepare(
        `INSERT INTO platform_operation_logs
           (id, actor_user_id, category, action, target_kind, target_id, target_label, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newLogId(),
        actor,
        input.category,
        clip(input.action, 64),
        input.targetKind ?? null,
        input.targetId ?? null,
        input.targetLabel ? clip(input.targetLabel, 512) : null,
        summary,
        nowIso(),
      )
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingTable(msg)) return;
    console.error("[oplog-insert]", msg);
  }
}

export async function listOperationLogs(
  db: AppDatabase,
  opts: { category?: string; actorUserId?: string; limit?: number } = {},
): Promise<PlatformOperationLog[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 80));
  const clauses: string[] = [];
  const binds: (string | number)[] = [];
  const cat = (opts.category ?? "").trim();
  if (CATEGORIES.has(cat as OperationCategory)) {
    clauses.push("category = ?");
    binds.push(cat);
  }
  if (opts.actorUserId?.trim()) {
    clauses.push("actor_user_id = ?");
    binds.push(opts.actorUserId.trim());
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  try {
    const stmt = db.prepare(
      `SELECT id, actor_user_id, category, action, target_kind, target_id, target_label, summary, created_at
       FROM platform_operation_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
    );
    const q =
      binds.length > 0
        ? await stmt.bind(...binds).all<OpLogRow>()
        : await stmt.all<OpLogRow>();
    return (q.results ?? []).map(rowToLog);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isMissingTable(msg)) return [];
    if (/mysqld_stmt_execute|Incorrect arguments/i.test(msg)) {
      console.error("[oplog-list]", msg);
      throw new Error("操作日志暂时无法读取，请稍后刷新");
    }
    throw e;
  }
}
