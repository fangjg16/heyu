import type { AppDatabase } from "./app-database";
import { embedDocumentChunks } from "./embeddings";
import { requireHermesAuth, type HermesBridgeEnv } from "./hermes-bridge";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

type ReembedEnv = HermesBridgeEnv & {
  DB: AppDatabase;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
};

type DocumentRow = {
  id: string;
  project_id: string;
  filename: string;
};

async function listDocumentsForReembed(
  env: ReembedEnv,
  params: {
    projectId?: string;
    documentId?: string;
    force: boolean;
    limit: number;
  },
): Promise<DocumentRow[]> {
  const conditions = [
    `EXISTS (SELECT 1 FROM chunks c WHERE c.document_id = d.id)`,
    `(d.deleted_at IS NULL OR d.deleted_at = '')`,
  ];
  const binds: (string | number)[] = [];

  if (params.documentId) {
    conditions.push(`d.id = ?`);
    binds.push(params.documentId);
  } else if (params.projectId) {
    conditions.push(`d.project_id = ?`);
    binds.push(params.projectId);
  }

  if (!params.force) {
    conditions.push(`EXISTS (
      SELECT 1 FROM chunks c
      WHERE c.document_id = d.id
        AND (
          c.embedding_json IS NULL
          OR TRIM(c.embedding_json) = ''
          OR c.embedding_json = '[]'
        )
    )`);
  }

  binds.push(params.limit);

  const sql = `SELECT d.id, d.project_id, d.filename
    FROM documents d
    WHERE ${conditions.join(" AND ")}
    ORDER BY d.created_at DESC
    LIMIT ?`;

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all<DocumentRow>();

  return results ?? [];
}

/** POST /api/admin/documents/reembed — Bearer JFO_INTERNAL_KEY */
export async function handleReembedDocuments(
  request: Request,
  env: ReembedEnv,
  url: URL,
  ctx: ExecutionContext,
): Promise<Response> {
  const auth = requireHermesAuth(request, env);
  if (auth) return auth;

  if (!(env.DASHSCOPE_API_KEY || "").trim()) {
    return json({ ok: false, error: "未配置 DASHSCOPE_API_KEY，无法向量化" }, 503);
  }

  const projectId = (url.searchParams.get("projectId") ?? "").trim() || undefined;
  const documentId = (url.searchParams.get("documentId") ?? "").trim() || undefined;
  const force =
    url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), 100)
    : 20;

  if (!projectId && !documentId) {
    return json(
      {
        error: "请提供 projectId 或 documentId 查询参数（避免全库误扫）",
      },
      400,
    );
  }

  const docs = await listDocumentsForReembed(env, {
    projectId,
    documentId,
    force,
    limit,
  });

  if (docs.length === 0) {
    return json({
      ok: true,
      queued: 0,
      message: force
        ? "未找到含 chunks 的文档"
        : "未找到缺少 embedding 的文档（均已向量化或尚无正文分块）",
      documents: [],
    });
  }

  const documentIds = docs.map((d) => d.id);
  ctx.waitUntil(
    (async () => {
      for (const doc of docs) {
        await embedDocumentChunks(env, doc.id);
      }
    })(),
  );

  return json({
    ok: true,
    queued: docs.length,
    force,
    projectId: projectId ?? null,
    documentId: documentId ?? null,
    documents: docs.map((d) => ({
      id: d.id,
      projectId: d.project_id,
      filename: d.filename,
    })),
    message: "已向量化任务提交后台执行；大文档需数分钟，可稍后查 chunks.embedding_json",
  });
}
