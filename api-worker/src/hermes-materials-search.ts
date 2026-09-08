import type { AppDatabase } from "./app-database";
import { loadChunks } from "./chat-data";
import { selectChunksForChat, type ChunkRow } from "./search";

export type HermesMaterialsSearchEnv = {
  DB: AppDatabase;
};

export type HermesParsedHit = {
  documentId: string;
  filename: string;
  scope: "package" | "session";
  chunkIndex: number;
  text: string;
};

export type ParsedCacheSearchScope = "package" | "session" | "all";

type JsonFn = (data: unknown, status?: number) => Response;

function readJsonFn(): JsonFn {
  return (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseScope(raw: unknown): ParsedCacheSearchScope {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "package" || s === "session") return s;
  return "all";
}

/** 从已解析 chunks 里按问题取相关片段，不回源全文。 */
export function selectParsedCacheHits(
  chunks: ChunkRow[],
  query: string,
  options?: {
    topK?: number;
    maxChars?: number;
    scope?: ParsedCacheSearchScope;
  },
): HermesParsedHit[] {
  const scope = options?.scope ?? "all";
  const pool =
    scope === "package"
      ? chunks.filter((c) => c.scope !== "session")
      : scope === "session"
        ? chunks.filter((c) => c.scope === "session")
        : chunks;
  const hits = selectChunksForChat(pool, query, {
    deep: false,
    maxChars: options?.maxChars ?? 12_000,
    topK: options?.topK ?? 8,
  });
  return hits.map((h) => ({
    documentId: h.document_id,
    filename: (h.filename ?? "资料").trim() || "资料",
    scope: h.scope === "session" ? "session" : "package",
    chunkIndex: h.chunk_index,
    text: h.text,
  }));
}

async function readSearchInput(request: Request): Promise<{
  query: string;
  userId: string;
  conversationId: string;
  scope: ParsedCacheSearchScope;
  topK: number;
  maxChars: number;
}> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const query = String(body.query ?? url.searchParams.get("q") ?? "")
    .trim();
  const userId = String(body.userId ?? url.searchParams.get("userId") ?? "").trim();
  const conversationId = String(
    body.conversationId ?? url.searchParams.get("conversationId") ?? "",
  ).trim();
  const scope = parseScope(body.scope ?? url.searchParams.get("scope"));
  const topK = clampInt(body.topK ?? url.searchParams.get("topK"), 8, 1, 24);
  const maxChars = clampInt(
    body.maxChars ?? url.searchParams.get("maxChars"),
    12_000,
    1_000,
    36_000,
  );
  return { query, userId, conversationId, scope, topK, maxChars };
}

/**
 * GET/POST /api/hermes/projects/:id/search
 * 读上传时已解析的 chunks，给 Hermes 当「项目记忆」；不够再按需 textUrl。
 */
export async function handleHermesMaterialsSearch(
  request: Request,
  env: HermesMaterialsSearchEnv,
  projectId: string,
  json: JsonFn = readJsonFn(),
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const input = await readSearchInput(request);
  if (input.query.length < 2) {
    return json({ error: "缺少 q / query", hits: [] as HermesParsedHit[] }, 400);
  }
  if ((input.scope === "session" || input.scope === "all") && !input.userId) {
    return json(
      {
        error: "缺少 userId",
        hint: "scope=session 或 all 须带账号，才能纳入本对话附件；只要资料包可 scope=package。",
        hits: [] as HermesParsedHit[],
      },
      400,
    );
  }

  let chunks: ChunkRow[] = [];
  try {
    chunks = await loadChunks(
      env,
      projectId,
      input.userId,
      input.conversationId || undefined,
    );
  } catch {
    return json(
      {
        source: "parsed_cache",
        query: input.query,
        hits: [] as HermesParsedHit[],
        hitCount: 0,
        note: "解析缓存暂时读不到。不要对用户说接口不可用；按对话上下文作答并标明资料还没对上。",
      },
      200,
    );
  }

  const hits = selectParsedCacheHits(chunks, input.query, {
    topK: input.topK,
    maxChars: input.maxChars,
    scope: input.scope,
  });

  return json({
    source: "parsed_cache",
    query: input.query,
    hits,
    hitCount: hits.length,
    note:
      hits.length > 0
        ? "这些片段来自上传时已解析的缓存，视为已读。足够作答就不要再 GET textUrl；不够再按 documentId 拉该文件正文。"
        : "缓存没有对上相关片段。可换关键词再搜，或 GET manifest 后只对缺口文件拉 textUrl。寒暄则直接短答。",
  });
}
