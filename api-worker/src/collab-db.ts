import type { AppDatabase } from "./app-database";

export type CollabReplyMode = "text" | "file" | "both";
export type CollabPriority = "P1" | "P2" | "P3";
export type CollabItemStatus =
  | "draft"
  | "pending_reply"
  | "saved"
  | "submitted"
  | "needs_more"
  | "confirmed";

export type CollabFileReq = {
  id: string;
  label: string;
  required: boolean;
};

export type CollabItemRow = {
  id: string;
  project_id: string;
  source_question_text: string;
  title: string;
  body: string;
  reply_mode: string;
  priority: string;
  due_at: string | null;
  investor_note: string | null;
  file_reqs_json: string;
  status: string;
  published_at: string;
  published_by: string;
  assigned_to?: string | null;
  reply_text: string | null;
  reply_saved_at: string | null;
  reply_submitted_at: string | null;
  reply_by: string | null;
  review_note: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CollabItemPublic = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  replyMode: CollabReplyMode;
  priority: CollabPriority;
  dueAt: string | null;
  investorNote: string | null;
  fileReqs: CollabFileReq[];
  status: CollabItemStatus;
  publishedAt: string;
  publishedBy: string;
  assignedTo?: string | null;
  replyText: string | null;
  replySavedAt: string | null;
  replySubmittedAt: string | null;
  replyBy: string | null;
  reviewNote: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** 仅投资团队可见 */
  sourceQuestionText?: string;
};

export function parseFileReqs(raw: string | null | undefined): CollabFileReq[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const label = String(o.label ?? "").trim();
        if (!label) return null;
        return {
          id: String(o.id ?? crypto.randomUUID()),
          label,
          required: o.required !== false,
        };
      })
      .filter((x): x is CollabFileReq => Boolean(x));
  } catch {
    return [];
  }
}

export function parseReplyMode(raw: string | null | undefined): CollabReplyMode {
  if (raw === "text" || raw === "file" || raw === "both") return raw;
  return "both";
}

export function parsePriority(raw: string | null | undefined): CollabPriority {
  if (raw === "P1" || raw === "P2" || raw === "P3") return raw;
  return "P2";
}

export function parseStatus(raw: string | null | undefined): CollabItemStatus {
  if (
    raw === "draft" ||
    raw === "pending_reply" ||
    raw === "saved" ||
    raw === "submitted" ||
    raw === "needs_more" ||
    raw === "confirmed"
  ) {
    return raw;
  }
  return "pending_reply";
}

/** 已发给协作方（草稿对协作方不可见） */
export function isCollabSentToIssuer(status: CollabItemStatus): boolean {
  return status !== "draft";
}

export function rowToPublic(
  row: CollabItemRow,
  opts?: { includeInternal?: boolean },
): CollabItemPublic {
  const item: CollabItemPublic = {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    replyMode: parseReplyMode(row.reply_mode),
    priority: parsePriority(row.priority),
    dueAt: row.due_at,
    investorNote: row.investor_note,
    fileReqs: parseFileReqs(row.file_reqs_json),
    status: parseStatus(row.status),
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    assignedTo: row.assigned_to ?? null,
    replyText: row.reply_text,
    replySavedAt: row.reply_saved_at,
    replySubmittedAt: row.reply_submitted_at,
    replyBy: row.reply_by,
    reviewNote: row.review_note,
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (opts?.includeInternal) {
    item.sourceQuestionText = row.source_question_text;
  }
  return item;
}

const COLS = `id, project_id, source_question_text, title, body, reply_mode, priority, due_at,
  investor_note, file_reqs_json, status, published_at, published_by, assigned_to, reply_text,
  reply_saved_at, reply_submitted_at, reply_by, review_note, confirmed_at, confirmed_by,
  created_at, updated_at`;
const COLS_NO_ASSIGNED = `id, project_id, source_question_text, title, body, reply_mode, priority, due_at,
  investor_note, file_reqs_json, status, published_at, published_by, reply_text,
  reply_saved_at, reply_submitted_at, reply_by, review_note, confirmed_at, confirmed_by,
  created_at, updated_at`;

type Env = { DB: AppDatabase };

function isMissingAssignedTo(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Unknown column ['`]?assigned_to['`]?|no such column:\s*assigned_to/i.test(
    msg,
  );
}

export async function insertCollabItem(
  env: Env,
  input: {
    id: string;
    projectId: string;
    sourceQuestionText: string;
    title: string;
    body: string;
    replyMode: CollabReplyMode;
    priority: CollabPriority;
    dueAt: string | null;
    investorNote: string | null;
    fileReqs: CollabFileReq[];
    publishedBy: string;
    assignedTo?: string | null;
    status?: CollabItemStatus;
  },
): Promise<CollabItemRow> {
  const now = new Date().toISOString();
  const status = input.status ?? "pending_reply";
  try {
    await env.DB.prepare(
      `INSERT INTO project_collab_items (
         id, project_id, source_question_text, title, body, reply_mode, priority, due_at,
         investor_note, file_reqs_json, status, published_at, published_by, assigned_to,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.id,
        input.projectId,
        input.sourceQuestionText,
        input.title,
        input.body,
        input.replyMode,
        input.priority,
        input.dueAt,
        input.investorNote,
        JSON.stringify(input.fileReqs),
        status,
        now,
        input.publishedBy,
        input.assignedTo ?? null,
        now,
        now,
      )
      .run();
  } catch (e) {
    if (!isMissingAssignedTo(e)) throw e;
    await env.DB.prepare(
      `INSERT INTO project_collab_items (
         id, project_id, source_question_text, title, body, reply_mode, priority, due_at,
         investor_note, file_reqs_json, status, published_at, published_by,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.id,
        input.projectId,
        input.sourceQuestionText,
        input.title,
        input.body,
        input.replyMode,
        input.priority,
        input.dueAt,
        input.investorNote,
        JSON.stringify(input.fileReqs),
        status,
        now,
        input.publishedBy,
        now,
        now,
      )
      .run();
  }
  const row = await getCollabItem(env, input.projectId, input.id);
  if (!row) throw new Error("协作事项写入后读取失败");
  return row;
}

export async function getCollabItem(
  env: Env,
  projectId: string,
  itemId: string,
): Promise<CollabItemRow | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT ${COLS} FROM project_collab_items WHERE id = ? AND project_id = ?`,
    )
      .bind(itemId, projectId)
      .first<CollabItemRow>();
    return row ?? null;
  } catch (e) {
    if (!isMissingAssignedTo(e)) throw e;
    const row = await env.DB.prepare(
      `SELECT ${COLS_NO_ASSIGNED} FROM project_collab_items WHERE id = ? AND project_id = ?`,
    )
      .bind(itemId, projectId)
      .first<CollabItemRow>();
    return row ?? null;
  }
}

export async function listCollabItems(
  env: Env,
  projectId: string,
): Promise<CollabItemRow[]> {
  const order = `
     ORDER BY
       CASE status
         WHEN 'needs_more' THEN 0
         WHEN 'pending_reply' THEN 1
         WHEN 'saved' THEN 2
         WHEN 'submitted' THEN 3
         WHEN 'confirmed' THEN 4
         WHEN 'draft' THEN 5
         ELSE 6
       END,
       COALESCE(due_at, '9999') ASC,
       published_at DESC`;
  try {
    const q = await env.DB.prepare(
      `SELECT ${COLS} FROM project_collab_items WHERE project_id = ?${order}`,
    )
      .bind(projectId)
      .all<CollabItemRow>();
    return q.results ?? [];
  } catch (e) {
    if (!isMissingAssignedTo(e)) throw e;
    const q = await env.DB.prepare(
      `SELECT ${COLS_NO_ASSIGNED} FROM project_collab_items WHERE project_id = ?${order}`,
    )
      .bind(projectId)
      .all<CollabItemRow>();
    return q.results ?? [];
  }
}

export async function listCollabItemsForProjects(
  env: Env,
  projectIds: string[],
): Promise<CollabItemRow[]> {
  if (projectIds.length === 0) return [];
  const placeholders = projectIds.map(() => "?").join(",");
  try {
    const q = await env.DB.prepare(
      `SELECT ${COLS} FROM project_collab_items
       WHERE project_id IN (${placeholders})
       ORDER BY COALESCE(due_at, '9999') ASC, published_at DESC`,
    )
      .bind(...projectIds)
      .all<CollabItemRow>();
    return q.results ?? [];
  } catch (e) {
    if (!isMissingAssignedTo(e)) throw e;
    const q = await env.DB.prepare(
      `SELECT ${COLS_NO_ASSIGNED} FROM project_collab_items
       WHERE project_id IN (${placeholders})
       ORDER BY COALESCE(due_at, '9999') ASC, published_at DESC`,
    )
      .bind(...projectIds)
      .all<CollabItemRow>();
    return q.results ?? [];
  }
}

export async function updateCollabItem(
  env: Env,
  projectId: string,
  itemId: string,
  patch: Partial<{
    status: CollabItemStatus;
    title: string;
    body: string;
    sourceQuestionText: string;
    priority: CollabPriority;
    dueAt: string | null;
    assignedTo: string | null;
    investorNote: string | null;
    publishedAt: string;
    replyText: string | null;
    replySavedAt: string | null;
    replySubmittedAt: string | null;
    replyBy: string | null;
    reviewNote: string | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
  }>,
): Promise<CollabItemRow | null> {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const binds: unknown[] = [now];
  const apply = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    binds.push(value);
  };
  if (patch.status !== undefined) apply("status", patch.status);
  if (patch.title !== undefined) apply("title", patch.title);
  if (patch.body !== undefined) apply("body", patch.body);
  if (patch.sourceQuestionText !== undefined) {
    apply("source_question_text", patch.sourceQuestionText);
  }
  if (patch.priority !== undefined) apply("priority", patch.priority);
  if (patch.dueAt !== undefined) apply("due_at", patch.dueAt);
  if (patch.investorNote !== undefined) apply("investor_note", patch.investorNote);
  if (patch.publishedAt !== undefined) apply("published_at", patch.publishedAt);
  if (patch.replyText !== undefined) apply("reply_text", patch.replyText);
  if (patch.replySavedAt !== undefined) apply("reply_saved_at", patch.replySavedAt);
  if (patch.replySubmittedAt !== undefined) {
    apply("reply_submitted_at", patch.replySubmittedAt);
  }
  if (patch.replyBy !== undefined) apply("reply_by", patch.replyBy);
  if (patch.reviewNote !== undefined) apply("review_note", patch.reviewNote);
  if (patch.confirmedAt !== undefined) apply("confirmed_at", patch.confirmedAt);
  if (patch.confirmedBy !== undefined) apply("confirmed_by", patch.confirmedBy);

  const runUpdate = async (includeAssigned: boolean) => {
    const nextSets = [...sets];
    const nextBinds = [...binds];
    if (includeAssigned && patch.assignedTo !== undefined) {
      nextSets.push("assigned_to = ?");
      nextBinds.push(patch.assignedTo);
    }
    nextBinds.push(itemId, projectId);
    await env.DB.prepare(
      `UPDATE project_collab_items SET ${nextSets.join(", ")} WHERE id = ? AND project_id = ?`,
    )
      .bind(...nextBinds)
      .run();
  };

  try {
    await runUpdate(true);
  } catch (e) {
    if (!isMissingAssignedTo(e) || patch.assignedTo === undefined) throw e;
    await runUpdate(false);
  }
  return getCollabItem(env, projectId, itemId);
}

export type CollabOverviewCounts = {
  pendingReply: number;
  pendingFiles: number;
  submitted: number;
  needsMore: number;
};

export function summarizeCollabItems(
  items: CollabItemPublic[],
  attachedItemIds: Set<string>,
): CollabOverviewCounts {
  let pendingReply = 0;
  let pendingFiles = 0;
  let submitted = 0;
  let needsMore = 0;
  for (const item of items) {
    if (item.status === "pending_reply" || item.status === "saved") {
      pendingReply += 1;
    }
    if (item.status === "submitted") submitted += 1;
    if (item.status === "needs_more") {
      needsMore += 1;
      pendingReply += 1;
    }
    const needsFile =
      item.replyMode === "file" || item.replyMode === "both";
    const required = item.fileReqs.filter((r) => r.required);
    if (
      needsFile &&
      (item.status === "pending_reply" ||
        item.status === "saved" ||
        item.status === "needs_more") &&
      (required.length > 0 ? !attachedItemIds.has(item.id) : !attachedItemIds.has(item.id))
    ) {
      pendingFiles += 1;
    }
  }
  return { pendingReply, pendingFiles, submitted, needsMore };
}
