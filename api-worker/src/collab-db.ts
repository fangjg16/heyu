import type { AppDatabase } from "./app-database";
import {
  parseQuestionKind,
  type QuestionKind,
} from "./open-questions-parse";

export type CollabReplyMode = "text" | "file" | "both";
export type CollabPriority = "P1" | "P2" | "P3";
export type CollabItemStatus =
  | "draft"
  | "pending_reply"
  | "saved"
  | "submitted"
  | "needs_more"
  | "confirmed"
  | "discarded";

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
  question_kind?: string | null;
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
  sort_order?: number | null;
};

export type CollabItemPublic = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  replyMode: CollabReplyMode;
  priority: CollabPriority;
  questionKind?: QuestionKind | null;
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
  sortOrder?: number;
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
    raw === "confirmed" ||
    raw === "discarded"
  ) {
    return raw;
  }
  return "pending_reply";
}

/** 已发给协作方（草稿和已删除的未发送事项对协作方不可见） */
export function isCollabSentToIssuer(status: CollabItemStatus): boolean {
  return status !== "draft" && status !== "discarded";
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
    questionKind: parseQuestionKind(row.question_kind),
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
    sortOrder: Number(row.sort_order ?? 0) || 0,
  };
  if (opts?.includeInternal) {
    item.sourceQuestionText = row.source_question_text;
  }
  return item;
}

const COLS = `id, project_id, source_question_text, title, body, reply_mode, priority, question_kind, due_at,
  investor_note, file_reqs_json, status, published_at, published_by, assigned_to, reply_text,
  reply_saved_at, reply_submitted_at, reply_by, review_note, confirmed_at, confirmed_by,
  created_at, updated_at`;
const COLS_NO_KIND = `id, project_id, source_question_text, title, body, reply_mode, priority, due_at,
  investor_note, file_reqs_json, status, published_at, published_by, assigned_to, reply_text,
  reply_saved_at, reply_submitted_at, reply_by, review_note, confirmed_at, confirmed_by,
  created_at, updated_at`;
const COLS_NO_ASSIGNED = `id, project_id, source_question_text, title, body, reply_mode, priority, due_at,
  investor_note, file_reqs_json, status, published_at, published_by, reply_text,
  reply_saved_at, reply_submitted_at, reply_by, review_note, confirmed_at, confirmed_by,
  created_at, updated_at`;
const COLS_SORT = `${COLS}, sort_order`;
const COLS_NO_KIND_SORT = `${COLS_NO_KIND}, sort_order`;
const COLS_NO_ASSIGNED_SORT = `${COLS_NO_ASSIGNED}, sort_order`;

type Env = { DB: AppDatabase };

function isMissingColumn(err: unknown, col: string): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return new RegExp(
    `Unknown column ['\`]?${col}['\`]?|no such column:\\s*${col}`,
    "i",
  ).test(msg);
}

export function isMissingSortOrder(err: unknown): boolean {
  return isMissingColumn(err, "sort_order");
}

function isMissingAssignedTo(err: unknown): boolean {
  return isMissingColumn(err, "assigned_to");
}

function isMissingQuestionKind(err: unknown): boolean {
  return isMissingColumn(err, "question_kind");
}

function isMissingOptionalCol(err: unknown): boolean {
  return (
    isMissingQuestionKind(err) ||
    isMissingAssignedTo(err) ||
    isMissingSortOrder(err)
  );
}

const STATUS_ORDER = `
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

/** 拖过顺序的事项优先；没拖过（sort_order=0）仍按原来的状态/截止日。 */
const MANUAL_ORDER = `
       CASE WHEN sort_order = 0 THEN 1 ELSE 0 END,
       sort_order ASC,
       ${STATUS_ORDER}`;

/** 还没拖过排序时返回 0；已经排过则接到末尾。列不存在时返回 null。 */
async function nextManualSortOrder(
  env: Env,
  projectId: string,
): Promise<number | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM project_collab_items WHERE project_id = ?`,
    )
      .bind(projectId)
      .first<{ m: number | null }>();
    const max = Number(row?.m ?? 0) || 0;
    return max > 0 ? max + 1 : 0;
  } catch (e) {
    if (isMissingSortOrder(e)) return null;
    throw e;
  }
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
    questionKind?: QuestionKind | null;
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
  const sortOrder = await nextManualSortOrder(env, input.projectId);
  const fileReqs = JSON.stringify(input.fileReqs);
  const kind = parseQuestionKind(input.questionKind);
  const insert = async (opts: {
    assigned: boolean;
    sort: boolean;
    kind: boolean;
  }) => {
    const cols = [
      "id",
      "project_id",
      "source_question_text",
      "title",
      "body",
      "reply_mode",
      "priority",
      "due_at",
      "investor_note",
      "file_reqs_json",
      "status",
      "published_at",
      "published_by",
    ];
    const vals: unknown[] = [
      input.id,
      input.projectId,
      input.sourceQuestionText,
      input.title,
      input.body,
      input.replyMode,
      input.priority,
      input.dueAt,
      input.investorNote,
      fileReqs,
      status,
      now,
      input.publishedBy,
    ];
    if (opts.kind) {
      cols.push("question_kind");
      vals.push(kind);
    }
    if (opts.assigned) {
      cols.push("assigned_to");
      vals.push(input.assignedTo ?? null);
    }
    if (opts.sort && sortOrder != null && sortOrder > 0) {
      cols.push("sort_order");
      vals.push(sortOrder);
    }
    cols.push("created_at", "updated_at");
    vals.push(now, now);
    const placeholders = cols.map(() => "?").join(", ");
    await env.DB.prepare(
      `INSERT INTO project_collab_items (${cols.join(", ")}) VALUES (${placeholders})`,
    )
      .bind(...vals)
      .run();
  };
  try {
    await insert({ assigned: true, sort: true, kind: true });
  } catch (e) {
    if (!isMissingOptionalCol(e)) throw e;
    try {
      await insert({
        assigned: !isMissingAssignedTo(e),
        sort: !isMissingSortOrder(e),
        kind: !isMissingQuestionKind(e),
      });
    } catch (e2) {
      if (!isMissingOptionalCol(e2)) throw e2;
      await insert({ assigned: false, sort: false, kind: false });
    }
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
  const tries = [COLS, COLS_NO_KIND, COLS_NO_ASSIGNED];
  let lastErr: unknown;
  for (const cols of tries) {
    try {
      const row = await env.DB.prepare(
        `SELECT ${cols} FROM project_collab_items WHERE id = ? AND project_id = ?`,
      )
        .bind(itemId, projectId)
        .first<CollabItemRow>();
      return row ?? null;
    } catch (e) {
      lastErr = e;
      if (!isMissingOptionalCol(e)) throw e;
    }
  }
  throw lastErr;
}

async function selectCollabRows(
  env: Env,
  whereSql: string,
  binds: unknown[],
): Promise<CollabItemRow[]> {
  const tries = [
    COLS_SORT,
    COLS,
    COLS_NO_KIND_SORT,
    COLS_NO_KIND,
    COLS_NO_ASSIGNED_SORT,
    COLS_NO_ASSIGNED,
  ];
  let lastErr: unknown;
  for (const cols of tries) {
    const order = cols.includes("sort_order") ? MANUAL_ORDER : STATUS_ORDER;
    try {
      const q = await env.DB.prepare(
        `SELECT ${cols} FROM project_collab_items ${whereSql} ORDER BY ${order}`,
      )
        .bind(...binds)
        .all<CollabItemRow>();
      return q.results ?? [];
    } catch (e) {
      lastErr = e;
      if (!isMissingOptionalCol(e)) throw e;
    }
  }
  throw lastErr;
}

export async function listCollabItems(
  env: Env,
  projectId: string,
): Promise<CollabItemRow[]> {
  return selectCollabRows(env, "WHERE project_id = ?", [projectId]);
}

export async function listCollabItemsForProjects(
  env: Env,
  projectIds: string[],
): Promise<CollabItemRow[]> {
  if (projectIds.length === 0) return [];
  const placeholders = projectIds.map(() => "?").join(",");
  return selectCollabRows(
    env,
    `WHERE project_id IN (${placeholders})`,
    projectIds,
  );
}

export async function reorderCollabItems(
  env: Env,
  projectId: string,
  ids: string[],
): Promise<void> {
  const rows = await listCollabItems(env, projectId);
  const known = new Set(rows.map((row) => row.id));
  const ordered = ids.filter((id) => known.has(id));
  for (const row of rows) {
    if (!ordered.includes(row.id)) ordered.push(row.id);
  }
  const now = new Date().toISOString();
  for (let i = 0; i < ordered.length; i += 1) {
    await env.DB.prepare(
      `UPDATE project_collab_items SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?`,
    )
      .bind(i + 1, now, ordered[i], projectId)
      .run();
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
    questionKind: QuestionKind | null;
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

  const runUpdate = async (opts: {
    includeAssigned: boolean;
    includeKind: boolean;
  }) => {
    const nextSets = [...sets];
    const nextBinds = [...binds];
    if (opts.includeKind && patch.questionKind !== undefined) {
      nextSets.push("question_kind = ?");
      nextBinds.push(parseQuestionKind(patch.questionKind));
    }
    if (opts.includeAssigned && patch.assignedTo !== undefined) {
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
    await runUpdate({ includeAssigned: true, includeKind: true });
  } catch (e) {
    if (!isMissingOptionalCol(e)) throw e;
    try {
      await runUpdate({
        includeAssigned: !isMissingAssignedTo(e) && patch.assignedTo !== undefined
          ? true
          : !isMissingAssignedTo(e),
        includeKind: !isMissingQuestionKind(e),
      });
    } catch (e2) {
      if (!isMissingOptionalCol(e2)) throw e2;
      await runUpdate({ includeAssigned: false, includeKind: false });
    }
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
    if (
      needsFile &&
      (item.status === "pending_reply" ||
        item.status === "saved" ||
        item.status === "needs_more") &&
      !attachedItemIds.has(item.id)
    ) {
      pendingFiles += 1;
    }
  }
  return { pendingReply, pendingFiles, submitted, needsMore };
}
