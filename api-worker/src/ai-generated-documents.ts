import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import {
  aiGeneratedPathForIntent,
  interviewNotesPath,
} from "./ai-generated-path";
import { invalidateChunkCache } from "./chunk-cache";
import { packageR2Key } from "./documents-access";
import { runDocumentParseSummaryBackground } from "./documents-parse-summary";
import { embedDocumentChunks } from "./embeddings";
import { chunkPlainText } from "./search";

type JobLike = {
  id: string;
  project_id: string;
  user_id: string;
  conversation_id: string | null;
  skill_intent: string;
  created_at: string;
};

type Env = { DB: AppDatabase; FILES: AppObjectStorage };

const INTENT_TITLE: Record<string, string> = {
  project_intake: "项目分析",
  ic_memo: "IC备忘录",
  business_due_diligence: "商业尽调",
  industry_due_diligence: "行业尽调",
  financial_due_diligence: "财务尽调",
  acquisition_due_diligence: "收购尽调",
  acquisition_intake: "收购立项",
  target_screening: "标的筛选",
  acquisition_economics: "收购经济性",
  acquisition_gate: "收购闸门",
  buyer_fit_transition: "接手适配",
  startup_design: "早期设计",
  startup_competitors: "早期竞品",
  startup_positioning: "早期定位",
  startup_pitch: "路演材料",
  classify_investment_theme: "主题分类",
  compliance_check: "合规检查",
  dd_checklist: "尽调清单",
  dd_claim_audit: "声明审计",
  document_reorganize: "文件整理",
  public_info_search: "外部资料",
  term_annotator: "术语表",
  background_check: "背景调查",
  risk_matrix: "风险矩阵",
  returns_analysis: "回报测算",
  sensitivity_analysis: "敏感性分析",
  value_creation_plan: "增值方案",
  gap_tracking: "信息缺口",
  node_monitoring: "节点监控",
};

function backgroundCtx(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      void promise;
    },
    passThroughOnException() {},
  } as ExecutionContext;
}

function extractMarkdownBody(answer: string): string {
  const fenced = /```(?:markdown|md)?\s*\n([\s\S]*?)```/iu.exec(answer.trim());
  if (fenced?.[1]?.trim() && fenced[1].trim().length >= 200) {
    return fenced[1].trim();
  }
  return answer.trim();
}

function looksLikeDocument(text: string): boolean {
  if (text.length < 400) return false;
  if (/^深度分析失败/.test(text)) return false;
  return (
    /^#{1,3}\s/m.test(text) ||
    text.includes("\n- ") ||
    text.includes("\n1. ") ||
    text.length >= 800
  );
}

/** 一次性种子：有此标记的资料文件在「更新全部」时沿用、不重写；用过后改成 used。 */
export const SEED_FIRST_VERSION_NOTE = "seed:startup-heyu-v1";
const SEED_FIRST_VERSION_USED_NOTE = "seed:startup-heyu-v1:used";

export function isUnconsumedSeedFirstVersionNote(
  note: string | null | undefined,
): boolean {
  return (note ?? "").trim() === SEED_FIRST_VERSION_NOTE;
}

async function findCurrentAtPath(
  db: AppDatabase,
  projectId: string,
  relativePath: string,
  filename: string,
): Promise<{
  id: string;
  versionGroup: string | null;
  r2Key: string | null;
} | null> {
  try {
    const q = await db
      .prepare(
        `SELECT id, r2_key, version_group, replaces_document_id, created_at
         FROM documents
         WHERE project_id = ? AND relative_path = ? AND filename = ?
           AND (deleted_at IS NULL OR deleted_at = '')
         ORDER BY created_at DESC
         LIMIT 40`,
      )
      .bind(projectId, relativePath, filename)
      .all<{
        id: string;
        r2_key: string | null;
        version_group: string | null;
        replaces_document_id: string | null;
        created_at: string;
      }>();
    const rows = q.results ?? [];
    if (rows.length === 0) return null;
    const superseded = new Set(
      rows.map((r) => (r.replaces_document_id ?? "").trim()).filter(Boolean),
    );
    const current = rows.find((r) => !superseded.has(r.id)) ?? rows[0]!;
    return {
      id: current.id,
      versionGroup: current.version_group || current.id,
      r2Key: current.r2_key ?? null,
    };
  } catch {
    try {
      const row = await db
        .prepare(
          `SELECT id, r2_key FROM documents
           WHERE project_id = ? AND relative_path = ? AND filename = ?
             AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .bind(projectId, relativePath, filename)
        .first<{ id: string; r2_key?: string | null }>();
      return row?.id
        ? { id: row.id, versionGroup: row.id, r2Key: row.r2_key ?? null }
        : null;
    } catch {
      return null;
    }
  }
}

export async function readCurrentMarkdownAtPath(
  env: Env,
  projectId: string,
  relativePath: string,
  filename: string,
): Promise<string | null> {
  const current = await findCurrentAtPath(
    env.DB,
    projectId,
    relativePath,
    filename,
  );
  if (!current?.r2Key) return null;
  try {
    const obj = await env.FILES.get(current.r2Key);
    if (!obj) return null;
    const text = await obj.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

async function readUploadNote(
  db: AppDatabase,
  projectId: string,
  documentId: string,
): Promise<string | null> {
  try {
    const row = await db
      .prepare(
        `SELECT upload_note FROM documents WHERE id = ? AND project_id = ?`,
      )
      .bind(documentId, projectId)
      .first<{ upload_note: string | null }>();
    return row?.upload_note ?? null;
  } catch {
    return null;
  }
}

export async function hasUnconsumedSeedFirstVersionDeliverable(
  env: { DB: AppDatabase },
  projectId: string,
  relativePath: string,
  filename: string,
): Promise<boolean> {
  const current = await findCurrentAtPath(
    env.DB,
    projectId,
    relativePath,
    filename,
  );
  if (!current?.id) return false;
  const note = await readUploadNote(env.DB, projectId, current.id);
  return isUnconsumedSeedFirstVersionNote(note);
}

/** 种子第一版仍在：沿用正文并吃掉标记，下次「更新全部」会重新写文件。 */
export async function tryReuseSeedFirstVersionDeliverable(
  env: Env,
  projectId: string,
  relativePath: string,
  filename: string,
): Promise<{ documentId: string } | null> {
  const current = await findCurrentAtPath(
    env.DB,
    projectId,
    relativePath,
    filename,
  );
  if (!current?.id || !current.r2Key) return null;
  const note = await readUploadNote(env.DB, projectId, current.id);
  if (!isUnconsumedSeedFirstVersionNote(note)) return null;
  try {
    const obj = await env.FILES.get(current.r2Key);
    const text = (await obj?.text())?.trim() ?? "";
    if (!text) return null;
  } catch {
    return null;
  }
  try {
    await env.DB.prepare(
      `UPDATE documents SET upload_note = ? WHERE id = ? AND project_id = ?`,
    )
      .bind(SEED_FIRST_VERSION_USED_NOTE, current.id, projectId)
      .run();
  } catch {
    /* 标记改不了也沿用正文，避免这次被模型盖掉 */
  }
  return { documentId: current.id };
}

export async function persistMarkdownAtPath(
  env: Env,
  input: {
    projectId: string;
    userId: string;
    conversationId?: string | null;
    relativePath: string;
    filename: string;
    body: string;
    sourceKind: string;
    fileCategory: string;
    uploadNote?: string | null;
  },
): Promise<string | null> {
  const projectId = input.projectId.trim();
  const userId = input.userId.trim();
  if (!projectId || !userId) return null;
  const body = input.body.trim();
  if (!body) return null;

  const note = (input.uploadNote ?? "").trim();
  if (note) {
    try {
      const existing = await env.DB.prepare(
        `SELECT id FROM documents
         WHERE project_id = ? AND upload_note = ?
           AND (deleted_at IS NULL OR deleted_at = '')
         LIMIT 1`,
      )
        .bind(projectId, note)
        .first<{ id: string }>();
      if (existing?.id) return existing.id;
    } catch {
      /* upload_note 未迁移时继续写入 */
    }
  }

  const prev = await findCurrentAtPath(
    env.DB,
    projectId,
    input.relativePath,
    input.filename,
  );
  const docId = crypto.randomUUID();
  const versionGroup = prev?.versionGroup || prev?.id || docId;
  const replacesId = prev?.id ?? null;
  const r2Key = packageR2Key(projectId, docId, input.filename);
  const bytes = new TextEncoder().encode(body);
  const now = new Date().toISOString();

  await env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });

  try {
    await env.DB.prepare(
      `INSERT INTO documents (id, project_id, conversation_id, filename, relative_path, r2_key, mime, byte_size, scope, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'package', ?, ?)`,
    )
      .bind(
        docId,
        projectId,
        input.conversationId ?? null,
        input.filename,
        input.relativePath,
        r2Key,
        "text/markdown",
        bytes.byteLength,
        userId,
        now,
      )
      .run();
  } catch {
    await env.DB.prepare(
      `INSERT INTO documents (id, project_id, conversation_id, filename, relative_path, r2_key, mime, scope, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'package', ?, ?)`,
    )
      .bind(
        docId,
        projectId,
        input.conversationId ?? null,
        input.filename,
        input.relativePath,
        r2Key,
        "text/markdown",
        userId,
        now,
      )
      .run();
  }

  try {
    await env.DB.prepare(
      `UPDATE documents SET source_kind = ?, file_category = ?, upload_note = ?,
          replaces_document_id = ?, version_group = ?
       WHERE id = ? AND project_id = ?`,
    )
      .bind(
        input.sourceKind,
        input.fileCategory,
        note || null,
        replacesId,
        versionGroup,
        docId,
        projectId,
      )
      .run();
  } catch {
    try {
      await env.DB.prepare(
        `UPDATE documents SET source_kind = ?, file_category = ?, upload_note = ?
         WHERE id = ? AND project_id = ?`,
      )
        .bind(input.sourceKind, input.fileCategory, note || null, docId, projectId)
        .run();
    } catch {
      /* 0026 未迁移时忽略 */
    }
  }

  const parts = chunkPlainText(body);
  for (let i = 0; i < parts.length; i++) {
    await env.DB.prepare(
      `INSERT INTO chunks (id, document_id, chunk_index, text) VALUES (?, ?, ?, ?)`,
    )
      .bind(`${docId}-${i}`, docId, i, parts[i])
      .run();
  }

  await invalidateChunkCache(
    projectId,
    userId,
    input.conversationId ?? undefined,
  );
  if (parts.length > 0) {
    const ctx = backgroundCtx();
    ctx.waitUntil(embedDocumentChunks(env as never, docId));
    ctx.waitUntil(
      runDocumentParseSummaryBackground(env as never, ctx, {
        projectId,
        documentId: docId,
        userId,
      }),
    );
  }
  return docId;
}

/** 深度任务完成后，把 Markdown 正文落入源文件「AI生成」分目录 */
export async function persistAgentAnswerAsMarkdown(
  env: Env,
  job: JobLike,
  answer: string,
): Promise<void> {
  const intent = (job.skill_intent ?? "").trim();
  const path = aiGeneratedPathForIntent(intent);
  if (!path) return;
  const body = extractMarkdownBody(answer);
  if (!looksLikeDocument(body)) return;

  await persistMarkdownAtPath(env, {
    projectId: job.project_id,
    userId: job.user_id,
    conversationId: job.conversation_id,
    relativePath: path.relativePath,
    filename: path.filename,
    body,
    sourceKind: "ai_generated",
    fileCategory: INTENT_TITLE[intent] || "AI生成",
    uploadNote: `agent_job:${job.id}`,
  });
}

export async function persistInterviewTranscript(
  env: Env,
  input: {
    projectId: string;
    userId: string;
    conversationId: string;
    body: string;
    roundIndex: number;
  },
): Promise<string | null> {
  const path = interviewNotesPath();
  return persistMarkdownAtPath(env, {
    projectId: input.projectId,
    userId: input.userId,
    conversationId: input.conversationId,
    relativePath: path.relativePath,
    filename: path.filename,
    body: input.body,
    sourceKind: "user_interview",
    fileCategory: "用户访谈",
    uploadNote: `startup_interview:round:${input.roundIndex}:${input.conversationId}`,
  });
}
