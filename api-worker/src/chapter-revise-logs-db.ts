import type { AppDatabase } from "./app-database";

export type ReviseLogStatus = "pending" | "ok" | "failed";

export type ChapterReviseInstructionLog = {
  id: string;
  projectId: string;
  runId: string | null;
  sectionId: string;
  userId: string;
  instruction: string;
  reviseNote: string | null;
  status: ReviseLogStatus;
  error: string | null;
  llmBackend: string | null;
  createdAt: string;
  completedAt: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

type ReviseLogRow = {
  id: string;
  project_id: string;
  run_id: string | null;
  section_id: string;
  user_id: string;
  instruction: string;
  revise_note: string | null;
  status: string;
  error: string | null;
  llm_backend: string | null;
  created_at: string;
  completed_at: string | null;
};

function newLogId(): string {
  return `rvl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rowToLog(r: ReviseLogRow): ChapterReviseInstructionLog {
  return {
    id: r.id,
    projectId: r.project_id,
    runId: r.run_id,
    sectionId: r.section_id,
    userId: r.user_id,
    instruction: r.instruction,
    reviseNote: r.revise_note,
    status: r.status as ReviseLogStatus,
    error: r.error,
    llmBackend: r.llm_backend,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

/** 发起改写时写入 pending 日志；表不存在则静默跳过 */
export async function insertReviseInstructionLog(
  db: AppDatabase,
  input: {
    projectId: string;
    runId?: string | null;
    sectionId: string;
    userId: string;
    instruction: string;
  },
): Promise<string | null> {
  const id = newLogId();
  const createdAt = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO chapter_revise_instruction_logs
           (id, project_id, run_id, section_id, user_id, instruction, revise_note,
            status, error, llm_backend, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, ?, NULL)`,
      )
      .bind(
        id,
        input.projectId,
        input.runId ?? null,
        input.sectionId,
        input.userId,
        input.instruction.slice(0, 8000),
        createdAt,
      )
      .run();
    return id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /no such table:\s*chapter_revise_instruction_logs/i.test(msg) ||
      /Unknown table ['`]?chapter_revise_instruction_logs['`]?/i.test(msg)
    ) {
      return null;
    }
    console.error("[revise-log-insert]", msg);
    return null;
  }
}

export async function completeReviseInstructionLog(
  db: AppDatabase,
  logId: string | null | undefined,
  input: {
    status: "ok" | "failed";
    reviseNote?: string | null;
    error?: string | null;
    llmBackend?: string | null;
  },
): Promise<void> {
  if (!logId) return;
  const completedAt = nowIso();
  try {
    await db
      .prepare(
        `UPDATE chapter_revise_instruction_logs
         SET status = ?, revise_note = ?, error = ?, llm_backend = ?, completed_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.status,
        input.reviseNote ?? null,
        input.error ?? null,
        input.llmBackend ?? null,
        completedAt,
        logId,
      )
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[revise-log-complete]", msg);
  }
}

export async function listReviseInstructionLogs(
  db: AppDatabase,
  opts: {
    projectId?: string;
    userId?: string;
    limit?: number;
  } = {},
): Promise<ChapterReviseInstructionLog[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 80));
  const clauses: string[] = [];
  const binds: (string | number)[] = [];
  if (opts.projectId?.trim()) {
    clauses.push("project_id = ?");
    binds.push(opts.projectId.trim());
  }
  if (opts.userId?.trim()) {
    clauses.push("user_id = ?");
    binds.push(opts.userId.trim());
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  try {
    const stmt = db.prepare(
      `SELECT id, project_id, run_id, section_id, user_id, instruction, revise_note,
              status, error, llm_backend, created_at, completed_at
       FROM chapter_revise_instruction_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
    );
    const q =
      binds.length > 0
        ? await stmt.bind(...binds).all<ReviseLogRow>()
        : await stmt.all<ReviseLogRow>();
    return (q.results ?? []).map(rowToLog);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /no such table:\s*chapter_revise_instruction_logs/i.test(msg) ||
      /Unknown table ['`]?chapter_revise_instruction_logs['`]?/i.test(msg)
    ) {
      return [];
    }
    throw e;
  }
}
