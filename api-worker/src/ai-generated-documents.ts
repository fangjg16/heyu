import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import {
  aiGeneratedPathForIntent,
  interviewNotesPath,
} from "./ai-generated-path";
import { getStoredAnalysisKind } from "./analysis-kind";
import {
  chatDeliverablePath,
  deliverableForChatIntent,
  hermesSkillForChatIntent,
} from "./chat-kind-deliverable";
import { invalidateChunkCache } from "./chunk-cache";
import { packageR2Key, sanitizeRelativePath } from "./documents-access";
import { insertDocumentRow } from "./documents-persist";
import {
  extractMarkdownBody,
  isWriteReceiptMarkdown,
  looksLikeAnalysisBody,
} from "./deliverable-markdown-quality";
import { recordPlainTextParseResult } from "./documents-parse-summary";
import { embedDocumentChunks } from "./embeddings";
import { chunkPlainText } from "./search";
import { humanUploadNote } from "./upload-note";

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

/** 历史上写在 upload_note 里的种子第一版标记；只给沿用逻辑读，不当人的说明。 */
export const SEED_FIRST_VERSION_NOTE = "seed:startup-heyu-v1";

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

/** 种子第一版仍在：沿用正文并清掉内部标记，下次「更新全部」会重新写文件。 */
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
      `UPDATE documents SET upload_note = NULL WHERE id = ? AND project_id = ?`,
    )
      .bind(current.id, projectId)
      .run();
  } catch {
    /* 标记清不掉也沿用正文，避免这次被模型盖掉 */
  }
  return { documentId: current.id };
}

/** 同一路径再写入走版本链（findCurrentAtPath），不用 upload_note 当身份证。 */
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
  const relativePath = sanitizeRelativePath(input.relativePath);
  const filename = (input.filename || "analysis.md").trim() || "analysis.md";

  const note = humanUploadNote(input.uploadNote);

  const prev = await findCurrentAtPath(env.DB, projectId, relativePath, filename);
  const docId = crypto.randomUUID();
  const versionGroup = prev?.versionGroup || prev?.id || docId;
  const replacesId = prev?.id ?? null;
  const r2Key = packageR2Key(projectId, docId, filename);
  const bytes = new TextEncoder().encode(body);
  const now = new Date().toISOString();

  await env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });

  await insertDocumentRow(env, {
    id: docId,
    projectId,
    conversationId: input.conversationId ?? null,
    filename,
    relativePath,
    r2Key,
    mime: "text/markdown",
    byteSize: bytes.byteLength,
    scope: "package",
    uploadedBy: userId,
    createdAt: now,
  });

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
      /* 0026 未迁移时忽略；文件已在目录里 */
    }
  }

  try {
    const parts = chunkPlainText(body);
    for (let i = 0; i < parts.length; i++) {
      await env.DB.prepare(
        `INSERT INTO chunks (id, document_id, chunk_index, text) VALUES (?, ?, ?, ?)`,
      )
        .bind(`${docId}-${i}`, docId, i, parts[i])
        .run();
    }
    if (parts.length > 0) {
      const ctx = backgroundCtx();
      ctx.waitUntil(embedDocumentChunks(env as never, docId));
    }
    try {
      await recordPlainTextParseResult(env, {
        documentId: docId,
        filename,
        body,
        fileCategory: input.fileCategory,
        chunkCount: parts.length,
      });
    } catch (e) {
      console.error("[ai-gen-persist] parse digest", e);
    }
  } catch (e) {
    console.error("[ai-gen-persist] chunks/embed", e);
  }

  try {
    await invalidateChunkCache(
      projectId,
      userId,
      input.conversationId ?? undefined,
    );
  } catch (e) {
    console.error("[ai-gen-persist] cache invalidate", e);
  }
  return docId;
}

export type PersistAgentAnswerResult =
  | {
      ok: true;
      documentId: string;
      relativePath: string;
      filename: string;
      skillName: string;
      title: string;
    }
  | {
      ok: false;
      reason: "no_path" | "not_document" | "write_receipt" | "write_failed";
      error?: string;
    };

export const AGENT_ANSWER_PERSIST_FAIL_NOTE =
  "这份分析还没写进源文件，请再生成一次。";

export const AGENT_ANSWER_PERSIST_SUCCESS_MARKER =
  "生成的文件已保存在源文件：";

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatAgentPersistSuccessNote(input: {
  skillName: string;
  title?: string | null;
  relativePath: string;
  filename: string;
}): string {
  const skill = input.skillName.trim() || "分析";
  const title = (input.title ?? "").trim();
  const skillBit =
    title && title !== skill ? `「${skill}」（${title}）` : `「${skill}」`;
  const stored = `${input.relativePath.replace(/\/+$/u, "")}/${input.filename}`.replace(
    /\/{2,}/gu,
    "/",
  );
  return `本次使用了系统 skill ${skillBit}。\n${AGENT_ANSWER_PERSIST_SUCCESS_MARKER}${stored}`;
}

export function withAgentPersistChatNote(
  displayAnswer: string,
  persist: PersistAgentAnswerResult,
): string {
  const body = displayAnswer.trimEnd();
  if (persist.ok) {
    if (body.includes(AGENT_ANSWER_PERSIST_SUCCESS_MARKER)) return body;
    return `${body}\n\n${formatAgentPersistSuccessNote(persist)}`;
  }
  if (!shouldTellUserPersistFailed(persist, displayAnswer)) return body;
  if (body.includes(AGENT_ANSWER_PERSIST_FAIL_NOTE)) return body;
  return `${body}\n\n${AGENT_ANSWER_PERSIST_FAIL_NOTE}`;
}

/** 深度任务完成后，把 Markdown 正文落入源文件「AI生成」分目录 */
export async function persistAgentAnswerAsMarkdown(
  env: Env,
  job: JobLike,
  answer: string,
): Promise<PersistAgentAnswerResult> {
  const intent = (job.skill_intent ?? "").trim();
  const kind = await getStoredAnalysisKind(env.DB, job.project_id).catch(
    () => null,
  );
  const path =
    chatDeliverablePath(intent, kind) ?? aiGeneratedPathForIntent(intent);
  if (!path) return { ok: false, reason: "no_path" };
  const body = extractMarkdownBody(answer);
  if (isWriteReceiptMarkdown(body)) {
    return { ok: false, reason: "write_receipt" };
  }
  const isCatalogFile = Boolean(chatDeliverablePath(intent, kind));
  if (!looksLikeAnalysisBody(body) && !(isCatalogFile && body.length >= 400)) {
    return { ok: false, reason: "not_document" };
  }
  const file = deliverableForChatIntent(intent, kind);

  try {
    const documentId = await persistMarkdownAtPath(env, {
      projectId: job.project_id,
      userId: job.user_id,
      conversationId: job.conversation_id,
      relativePath: path.relativePath,
      filename: path.filename,
      body,
      sourceKind: "ai_generated",
      fileCategory: file?.title || INTENT_TITLE[intent] || "AI生成",
    });
    if (!documentId) {
      return { ok: false, reason: "write_failed", error: "写入资料包失败" };
    }
    return {
      ok: true,
      documentId,
      relativePath: path.relativePath,
      filename: path.filename,
      skillName: file?.skill || hermesSkillForChatIntent(intent, kind),
      title: file?.title || INTENT_TITLE[intent] || "",
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[ai-gen-persist] write failed", intent, path.filename, error);
    return { ok: false, reason: "write_failed", error };
  }
}

export async function persistAgentAnswerAsMarkdownWithRetry(
  env: Env,
  job: JobLike,
  answer: string,
  attempts = 3,
): Promise<PersistAgentAnswerResult> {
  let last: PersistAgentAnswerResult = {
    ok: false,
    reason: "write_failed",
    error: "写入资料包失败",
  };
  for (let i = 0; i < attempts; i++) {
    last = await persistAgentAnswerAsMarkdown(env, job, answer);
    if (last.ok) return last;
    if (
      last.reason === "no_path" ||
      last.reason === "not_document" ||
      last.reason === "write_receipt"
    ) {
      return last;
    }
    if (i < attempts - 1) await sleepMs(400 * (i + 1));
  }
  return last;
}

export function shouldTellUserPersistFailed(
  result: PersistAgentAnswerResult,
  answer: string,
): boolean {
  if (result.ok || result.reason === "no_path") return false;
  if (result.reason === "write_failed" || result.reason === "write_receipt") {
    return true;
  }
  return extractMarkdownBody(answer).length >= 400;
}

export async function persistInterviewTranscript(
  env: Env,
  input: {
    projectId: string;
    userId: string;
    conversationId: string;
    body: string;
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
  });
}
