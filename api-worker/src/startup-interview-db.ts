import type { AppDatabase } from "./app-database";

export type InterviewStatus = "in_progress" | "paused" | "ended";

export type StartupInterview = {
  id: string;
  projectId: string;
  conversationId: string;
  status: InterviewStatus;
  roundIndex: number;
  answererUserId: string;
  startedBy: string;
  startedAt: string;
  pausedAt: string | null;
  endedAt: string | null;
  pendingPrompt: string | null;
  transcript: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function rowToInterview(row: {
  id: string;
  project_id: string;
  conversation_id: string;
  status: string;
  round_index: number;
  answerer_user_id: string;
  started_by: string;
  started_at: string;
  paused_at: string | null;
  ended_at: string | null;
  pending_prompt: string | null;
  transcript: string | null;
}): StartupInterview {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    status: row.status as InterviewStatus,
    roundIndex: Number(row.round_index) || 1,
    answererUserId: row.answerer_user_id,
    startedBy: row.started_by,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    endedAt: row.ended_at,
    pendingPrompt: row.pending_prompt,
    transcript: row.transcript,
  };
}

const SELECT = `SELECT id, project_id, conversation_id, status, round_index,
  answerer_user_id, started_by, started_at, paused_at, ended_at,
  pending_prompt, transcript
 FROM project_startup_interviews`;

export async function findActiveInterview(
  db: AppDatabase,
  projectId: string,
): Promise<StartupInterview | null> {
  const row = await db
    .prepare(
      `${SELECT}
       WHERE project_id = ? AND status IN ('in_progress', 'paused')
       ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(projectId)
    .first<Parameters<typeof rowToInterview>[0]>();
  return row ? rowToInterview(row) : null;
}

export async function findInterviewByConversation(
  db: AppDatabase,
  conversationId: string,
): Promise<StartupInterview | null> {
  const row = await db
    .prepare(`${SELECT} WHERE conversation_id = ? LIMIT 1`)
    .bind(conversationId)
    .first<Parameters<typeof rowToInterview>[0]>();
  return row ? rowToInterview(row) : null;
}

export async function getInterview(
  db: AppDatabase,
  id: string,
): Promise<StartupInterview | null> {
  const row = await db
    .prepare(`${SELECT} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<Parameters<typeof rowToInterview>[0]>();
  return row ? rowToInterview(row) : null;
}

export async function nextInterviewRound(
  db: AppDatabase,
  projectId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(round_index) AS n FROM project_startup_interviews WHERE project_id = ?`,
    )
    .bind(projectId)
    .first<{ n: number | null }>();
  return (Number(row?.n) || 0) + 1;
}

export async function insertInterview(
  db: AppDatabase,
  input: {
    projectId: string;
    conversationId: string;
    answererUserId: string;
    startedBy: string;
    roundIndex: number;
    pendingPrompt: string;
  },
): Promise<StartupInterview> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO project_startup_interviews (
         id, project_id, conversation_id, status, round_index,
         answerer_user_id, started_by, started_at, pending_prompt
       ) VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.projectId,
      input.conversationId,
      input.roundIndex,
      input.answererUserId,
      input.startedBy,
      now,
      input.pendingPrompt,
    )
    .run();
  const created = await getInterview(db, id);
  if (!created) throw new Error("访谈写入后读取失败");
  return created;
}

export async function updateInterview(
  db: AppDatabase,
  id: string,
  patch: Partial<{
    status: InterviewStatus;
    answererUserId: string;
    pausedAt: string | null;
    endedAt: string | null;
    pendingPrompt: string | null;
    transcript: string | null;
  }>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.status) {
    sets.push("status = ?");
    vals.push(patch.status);
  }
  if (patch.answererUserId) {
    sets.push("answerer_user_id = ?");
    vals.push(patch.answererUserId);
  }
  if (patch.pausedAt !== undefined) {
    sets.push("paused_at = ?");
    vals.push(patch.pausedAt);
  }
  if (patch.endedAt !== undefined) {
    sets.push("ended_at = ?");
    vals.push(patch.endedAt);
  }
  if (patch.pendingPrompt !== undefined) {
    sets.push("pending_prompt = ?");
    vals.push(patch.pendingPrompt);
  }
  if (patch.transcript !== undefined) {
    sets.push("transcript = ?");
    vals.push(patch.transcript);
  }
  if (sets.length === 0) return;
  vals.push(id);
  await db
    .prepare(
      `UPDATE project_startup_interviews SET ${sets.join(", ")} WHERE id = ?`,
    )
    .bind(...vals)
    .run();
}
