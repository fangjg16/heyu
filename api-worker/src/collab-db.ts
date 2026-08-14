export type CollabReplyMode = "text" | "file" | "both";
export type CollabPriority = "P1" | "P2" | "P3";
export type CollabItemStatus =
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
  investor_note, file_reqs_json, status, published_at, published_by, reply_text,
  reply_saved_at, reply_submitted_at, reply_by, review_note, confirmed_at, confirmed_by,
  created_at, updated_at`;

import type { AppDatabase } from "./app-database";

type Env = { DB: AppDatabase };

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
  },
): Promise<CollabItemRow> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO project_collab_items (
       id, project_id, source_question_text, title, body, reply_mode, priority, due_at,
       investor_note, file_reqs_json, status, published_at, published_by,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_reply', ?, ?, ?, ?)`,
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
      now,
      input.publishedBy,
      now,
      now,
    )
    .run();
  const row = await getCollabItem(env, input.projectId, input.id);
  if (!row) throw new Error("协作事项写入后读取失败");
  return row;
}

export async function getCollabItem(
  env: Env,
  projectId: string,
  itemId: string,
): Promise<CollabItemRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${COLS} FROM project_collab_items WHERE id = ? AND project_id = ?`,
  )
    .bind(itemId, projectId)
    .first<CollabItemRow>();
  return row ?? null;
}

export async function listCollabItems(
  env: Env,
  projectId: string,
): Promise<CollabItemRow[]> {
  const q = await env.DB.prepare(
    `SELECT ${COLS} FROM project_collab_items
     WHERE project_id = ?
     ORDER BY
       CASE status
         WHEN 'needs_more' THEN 0
         WHEN 'pending_reply' THEN 1
         WHEN 'saved' THEN 2
         WHEN 'submitted' THEN 3
         WHEN 'confirmed' THEN 4
         ELSE 5
       END,
       COALESCE(due_at, '9999') ASC,
       published_at DESC`,
  )
    .bind(projectId)
    .all<CollabItemRow>();
  return q.results ?? [];
}

export async function listCollabItemsForProjects(
  env: Env,
  projectIds: string[],
): Promise<CollabItemRow[]> {
  if (projectIds.length === 0) return [];
  const placeholders = projectIds.map(() => "?").join(",");
  const q = await env.DB.prepare(
    `SELECT ${COLS} FROM project_collab_items
     WHERE project_id IN (${placeholders})
     ORDER BY COALESCE(due_at, '9999') ASC, published_at DESC`,
  )
    .bind(...projectIds)
    .all<CollabItemRow>();
  return q.results ?? [];
}

export async function updateCollabItem(
  env: Env,
  projectId: string,
  itemId: string,
  patch: Partial<{
    status: CollabItemStatus;
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
  if (patch.status !== undefined) {
    sets.push("status = ?");
    binds.push(patch.status);
  }
  if (patch.replyText !== undefined) {
    sets.push("reply_text = ?");
    binds.push(patch.replyText);
  }
  if (patch.replySavedAt !== undefined) {
    sets.push("reply_saved_at = ?");
    binds.push(patch.replySavedAt);
  }
  if (patch.replySubmittedAt !== undefined) {
    sets.push("reply_submitted_at = ?");
    binds.push(patch.replySubmittedAt);
  }
  if (patch.replyBy !== undefined) {
    sets.push("reply_by = ?");
    binds.push(patch.replyBy);
  }
  if (patch.reviewNote !== undefined) {
    sets.push("review_note = ?");
    binds.push(patch.reviewNote);
  }
  if (patch.confirmedAt !== undefined) {
    sets.push("confirmed_at = ?");
    binds.push(patch.confirmedAt);
  }
  if (patch.confirmedBy !== undefined) {
    sets.push("confirmed_by = ?");
    binds.push(patch.confirmedBy);
  }
  binds.push(itemId, projectId);
  await env.DB.prepare(
    `UPDATE project_collab_items SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`,
  )
    .bind(...binds)
    .run();
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
