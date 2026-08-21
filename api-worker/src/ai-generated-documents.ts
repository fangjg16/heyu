import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
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
  comp_analysis: "对标分析",
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

function safeFileStem(raw: string): string {
  return raw.replace(/[^\w.\-一-龥]/gu, "_").replace(/_+/gu, "_").slice(0, 80) || "分析";
}

/** 深度任务完成后，把 Markdown 正文落入源文件「AI生成」 */
export async function persistAgentAnswerAsMarkdown(
  env: Env,
  job: JobLike,
  answer: string,
): Promise<void> {
  const intent = (job.skill_intent ?? "").trim();
  if (!intent || intent === "knowledge_network" || intent === "standard") return;
  const body = extractMarkdownBody(answer);
  if (!looksLikeDocument(body)) return;

  const projectId = job.project_id.trim();
  const userId = job.user_id.trim();
  if (!projectId || !userId) return;

  const note = `agent_job:${job.id}`;
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM documents
       WHERE project_id = ? AND upload_note = ?
         AND (deleted_at IS NULL OR deleted_at = '')
       LIMIT 1`,
    )
      .bind(projectId, note)
      .first<{ id: string }>();
    if (existing?.id) return;
  } catch {
    /* upload_note / deleted_at 未迁移时继续写入 */
  }

  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? "";
  const title = heading || INTENT_TITLE[intent] || "深度分析";
  const day = (job.created_at || new Date().toISOString()).slice(0, 10);
  const filename = `${day}-${safeFileStem(title)}.md`;
  const docId = crypto.randomUUID();
  const r2Key = packageR2Key(projectId, docId, filename);
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
        job.conversation_id,
        filename,
        "AI生成",
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
        job.conversation_id,
        filename,
        "AI生成",
        r2Key,
        "text/markdown",
        userId,
        now,
      )
      .run();
  }

  try {
    await env.DB.prepare(
      `UPDATE documents SET source_kind = ?, file_category = ?, upload_note = ?
       WHERE id = ? AND project_id = ?`,
    )
      .bind("ai_generated", INTENT_TITLE[intent] || "AI生成", note, docId, projectId)
      .run();
  } catch {
    /* 0026 未迁移时忽略 */
  }

  const parts = chunkPlainText(body);
  for (let i = 0; i < parts.length; i++) {
    await env.DB.prepare(
      `INSERT INTO chunks (id, document_id, chunk_index, text) VALUES (?, ?, ?, ?)`,
    )
      .bind(`${docId}-${i}`, docId, i, parts[i])
      .run();
  }

  await invalidateChunkCache(projectId, userId, job.conversation_id ?? undefined);
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
}
