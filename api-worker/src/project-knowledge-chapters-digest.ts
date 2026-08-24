import type { AppDatabase } from "./app-database";
import { loadChunks } from "./chat-data";
import { extractNamedSubjectsFromText } from "./chapter-named-subjects";
import { isDirectoryMarker } from "./documents-access";
import type { EmbedEnv } from "./embeddings";
import { embedTexts, scoreChunksByEmbedding } from "./embeddings";
import { isPlaceholderChunkText, scoreChunks, type ChunkRow } from "./search";

/** 目录层不占正文预算；正文预算只给 must-read 与向量补充 */
const MUST_READ_BODY_CHARS = 70_000;
const PER_FILE_MAX_CHARS = 14_000;
const MAX_MUST_READ_FILES = 8;
const VECTOR_SUPPLEMENT_CHARS = 24_000;
const VECTOR_TOP_K = 20;

type PackageDocMeta = {
  id: string;
  filename: string;
  relative_path: string | null;
  mime: string | null;
};

type ParseLite = {
  document_id: string;
  summary: string | null;
  document_type: string | null;
  key_points_json: string | null;
};

async function listPackageDocuments(
  db: AppDatabase,
  projectId: string,
): Promise<PackageDocMeta[]> {
  try {
    const q = await db
      .prepare(
        `SELECT id, filename, relative_path, mime
         FROM documents
         WHERE project_id = ?
           AND scope = 'package'
           AND (deleted_at IS NULL OR deleted_at = '')
         ORDER BY created_at ASC
         LIMIT 200`,
      )
      .bind(projectId)
      .all<PackageDocMeta>();
    return (q.results ?? []).filter(
      (d) => !isDirectoryMarker(d.mime, d.filename),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column ['`]?deleted_at['`]?/i.test(msg)) {
      const q = await db
        .prepare(
          `SELECT id, filename, relative_path, mime
           FROM documents
           WHERE project_id = ? AND scope = 'package'
           ORDER BY created_at ASC
           LIMIT 200`,
        )
        .bind(projectId)
        .all<PackageDocMeta>();
      return (q.results ?? []).filter(
        (d) => !isDirectoryMarker(d.mime, d.filename),
      );
    }
    if (/Unknown column ['`]?relative_path['`]?/i.test(msg)) {
      const q = await db
        .prepare(
          `SELECT id, filename, mime
           FROM documents
           WHERE project_id = ?
             AND scope = 'package'
             AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY created_at ASC
           LIMIT 200`,
        )
        .bind(projectId)
        .all<{ id: string; filename: string; mime: string | null }>();
      return (q.results ?? [])
        .filter((d) => !isDirectoryMarker(d.mime, d.filename))
        .map((d) => ({ ...d, relative_path: null }));
    }
    throw e;
  }
}

async function loadParseLites(
  db: AppDatabase,
  docIds: string[],
): Promise<Map<string, ParseLite>> {
  const map = new Map<string, ParseLite>();
  if (docIds.length === 0) return map;
  try {
    const batchSize = 40;
    for (let i = 0; i < docIds.length; i += batchSize) {
      const batch = docIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => "?").join(",");
      const q = await db
        .prepare(
          `SELECT document_id, summary, document_type, key_points_json
           FROM document_parse_results
           WHERE document_id IN (${placeholders})`,
        )
        .bind(...batch)
        .all<ParseLite>();
      for (const row of q.results ?? []) {
        map.set(row.document_id, row);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /no such table:\s*document_parse_results/i.test(msg) ||
      /Unknown table ['`]?document_parse_results['`]?/i.test(msg)
    ) {
      return map;
    }
    throw e;
  }
  return map;
}

function parseKeyPoints(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    return [];
  }
}

function groupChunksByDocument(chunks: ChunkRow[]): Map<string, ChunkRow[]> {
  const map = new Map<string, ChunkRow[]>();
  for (const c of chunks) {
    if (c.scope === "session") continue;
    if (isPlaceholderChunkText(c.text)) continue;
    const list = map.get(c.document_id) ?? [];
    list.push(c);
    map.set(c.document_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
  }
  return map;
}

const SECTION_FILE_BOOST: Record<string, RegExp> = {
  "project-overview":
    /deck|teaser|overview|简介|路演|bp|商业计划|推介|概览/iu,
  snapshot: /deck|teaser|overview|简介|路演|bp|商业计划|推介/iu,
  objectives: /声明|假设|缺口|待核|审计|claim/iu,
  industry: /行业|市场|赛道|industry|market/iu,
  legal: /合规|牌照|许可|监管|compliance|license/iu,
  benchmarks:
    /对标|可比|对比|竞品|对手|\bcomp|\bbenchmark|\bpeer|\bvs\b/iu,
  business: /业务|定价|客户|模式|canvas/iu,
  returns: /财务|估值|回报|模型|irr|financial/iu,
  capabilities: /合作|渠道|顾问|关系|对手方|网络/iu,
  ownership: /股权|股东|权属|工商|ubo|cap\s*table/iu,
  diligence: /尽调|检查|checklist|工作流|清单/iu,
  risks: /风险|诉讼|违约|红旗|risk/iu,
  questions: /问题|待确认|gap|问题清单/iu,
  framework: /决策|建议|投委会|memo|下一步/iu,
};

const SECTION_RETRIEVAL_QUERY: Record<string, string> = {
  "project-overview": "项目概览 简介 范围 判断 风险 下一步",
  snapshot: "项目范围 交易要点 类型 辖区 阶段",
  objectives: "声明 假设 证据缺口 待核",
  industry: "行业 市场 赛道 规模 政策",
  legal: "合规 牌照 许可 监管 权属",
  benchmarks: "对标 竞品 对比 可比 竞争对手 功能矩阵 对战",
  business: "业务模式 定价 客户 单位经济",
  returns: "估值 回报 IRR 财务模型 现金流",
  capabilities: "合作方 渠道 顾问 关系网络",
  ownership: "股权 股东 控制权 权属",
  diligence: "尽调 检查项 工作流 待收资料",
  risks: "风险 缓释 诉讼 红旗",
  questions: "待确认问题 缺口 阻断",
  framework: "投资建议 决策 下一步 条件",
};

function docSearchBlob(doc: PackageDocMeta): string {
  return `${doc.filename} ${doc.relative_path ?? ""}`;
}

function docLabel(doc: PackageDocMeta): string {
  const path = (doc.relative_path ?? "").trim();
  return path ? `${path}/${doc.filename}` : doc.filename;
}

function docMetaBlob(doc: PackageDocMeta, parsed: ParseLite | undefined): string {
  return [
    docSearchBlob(doc),
    parsed?.document_type ?? "",
    parsed?.summary ?? "",
    parseKeyPoints(parsed?.key_points_json ?? null).join(" "),
  ].join("\n");
}

function firstChunksBlob(
  doc: PackageDocMeta,
  byDoc: Map<string, ChunkRow[]>,
): string {
  const chunks = byDoc.get(doc.id) ?? [];
  return chunks
    .slice(0, 2)
    .map((c) => (c.text ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
}

/** 从改写指令/查询里抽出可匹配文件名与正文的词（含中文名、英文产品名） */
export function extractMaterialQueryTokens(extraQuery?: string): string[] {
  const extra = (extraQuery ?? "").trim();
  if (!extra) return [];
  const tokens = new Set<string>();
  for (const t of extra.split(/[\s,，、;；:：。！？!?/\\()（）【】\[\]]+/u)) {
    const s = t.trim();
    if (s.length < 2 || s.length > 24) continue;
    const cjkLen = (s.match(/[\u4e00-\u9fff]/gu) ?? []).length;
    if (cjkLen > 6) continue;
    tokens.add(s);
  }
  for (const run of extra.match(/[\u4e00-\u9fff]{2,}/gu) ?? []) {
    if (run.length <= 6) {
      tokens.add(run);
      if (run.length >= 4) tokens.add(run.slice(-2));
    }
  }
  for (const m of extra.match(/[A-Za-z][A-Za-z0-9._-]{1,40}/gu) ?? []) {
    tokens.add(m);
  }
  return [...tokens].slice(0, 24);
}

export function chapterRetrievalQuery(
  sectionId?: string,
  extraQuery?: string,
): string {
  const base = (sectionId && SECTION_RETRIEVAL_QUERY[sectionId]) || "项目尽调 资料";
  const extra = (extraQuery ?? "").trim();
  return extra ? `${base} ${extra}` : base;
}

function scoreMustRead(
  doc: PackageDocMeta,
  parsed: ParseLite | undefined,
  byDoc: Map<string, ChunkRow[]>,
  boostRe: RegExp | undefined,
  extraTokens: string[],
): number {
  const meta = docMetaBlob(doc, parsed);
  const head = firstChunksBlob(doc, byDoc);
  const blob = `${meta}\n${head}`;
  const blobLc = blob.toLowerCase();
  let n = 0;
  if (boostRe?.test(blob)) n += 8;
  for (const tok of extraTokens) {
    if (blobLc.includes(tok.toLowerCase())) n += 5;
  }
  return n;
}

export function selectMustReadDocs(
  docs: PackageDocMeta[],
  parseMap: Map<string, ParseLite>,
  byDoc: Map<string, ChunkRow[]>,
  sectionId?: string,
  extraQuery?: string,
  maxFiles: number = MAX_MUST_READ_FILES,
): PackageDocMeta[] {
  const boostRe = sectionId ? SECTION_FILE_BOOST[sectionId] : undefined;
  const extraTokens = extractMaterialQueryTokens(extraQuery);
  const scored = docs
    .map((doc) => ({
      doc,
      score: scoreMustRead(
        doc,
        parseMap.get(doc.id),
        byDoc,
        boostRe,
        extraTokens,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, maxFiles).map((x) => x.doc);
}

function takeChunksUpTo(
  chunks: ChunkRow[],
  fileBudget: number,
  globalRoom: number,
): { texts: string[]; used: number; truncated: boolean } {
  const texts: string[] = [];
  let used = 0;
  let truncated = false;
  for (const c of chunks) {
    const piece = (c.text ?? "").trim();
    if (!piece) continue;
    const room = Math.min(fileBudget - used, globalRoom - used);
    if (room <= 80) {
      truncated = true;
      break;
    }
    if (piece.length > room) {
      texts.push(`${piece.slice(0, room)}…`);
      used += room + 1;
      truncated = true;
      break;
    }
    texts.push(piece);
    used += piece.length + 1;
  }
  return { texts, used, truncated };
}

function formatCatalogEntry(
  doc: PackageDocMeta,
  parsed: ParseLite | undefined,
  isMustRead: boolean,
  hasChunks: boolean,
): string {
  const flags = [
    isMustRead ? "must-read" : "目录",
    parsed ? "已解析" : "未解析",
    hasChunks ? "有正文" : "无正文",
  ].join("·");
  const lines = [`- ${docLabel(doc)}（${flags}）`];
  if (parsed?.document_type?.trim()) {
    lines.push(`  类型：${parsed.document_type.trim()}`);
  }
  if (parsed?.summary?.trim()) {
    lines.push(`  摘要：${parsed.summary.trim()}`);
  }
  const points = parseKeyPoints(parsed?.key_points_json ?? null);
  if (points.length > 0) {
    lines.push(`  要点：${points.join("；")}`);
  }
  return lines.join("\n");
}

export type ChapterMaterialsAssembleInput = {
  docs: PackageDocMeta[];
  parseMap: Map<string, ParseLite>;
  byDoc: Map<string, ChunkRow[]>;
  mustRead: PackageDocMeta[];
  supplement: ChunkRow[];
  sectionId?: string;
};

export type ChapterMaterialsBundle = {
  digest: string;
  namedSubjects: string[];
};

/** 纯函数：三层资料文本（供测试与生成共用） */
export function assembleChapterMaterialsDigest(
  input: ChapterMaterialsAssembleInput,
): ChapterMaterialsBundle {
  const { docs, parseMap, byDoc, mustRead, supplement, sectionId } = input;
  const mustReadIds = new Set(mustRead.map((d) => d.id));
  const docsById = new Map(docs.map((d) => [d.id, d]));

  const catalogLines = docs.map((d) =>
    formatCatalogEntry(
      d,
      parseMap.get(d.id),
      mustReadIds.has(d.id),
      (byDoc.get(d.id)?.length ?? 0) > 0,
    ),
  );

  const parts: string[] = [
    "【资料目录 · 全量】",
    `共 ${docs.length} 个文件。本层是每份附件的摘要/要点，名单不截断；未标 must-read 的文件默认未读全文。`,
    "生成时只能把目录当索引：目录有、深读没有的事实须标「待补」，禁止用常识顶替。",
    "",
    ...catalogLines,
  ];

  const unreadFull: string[] = [];
  const deepParts: string[] = [];
  let bodyUsed = 0;

  for (const doc of mustRead) {
    const parsed = parseMap.get(doc.id);
    const chunks = byDoc.get(doc.id) ?? [];
    const header = [`── ${docLabel(doc)} ──`];
    if (parsed?.document_type?.trim()) {
      header.push(`类型：${parsed.document_type.trim()}`);
    }
    const headerLen = header.join("\n").length + 1;
    const room = MUST_READ_BODY_CHARS - bodyUsed - headerLen;
    if (room <= 80) {
      unreadFull.push(docLabel(doc));
      continue;
    }
    const taken = takeChunksUpTo(
      chunks,
      Math.min(PER_FILE_MAX_CHARS, room),
      room,
    );
    if (chunks.length === 0) {
      header.push(
        parsed?.summary?.trim()
          ? "（无正文 chunk，仅目录摘要；细节标待补）"
          : "（尚无解析摘要与正文，相关事实标待补）",
      );
    } else {
      header.push("正文：");
      header.push(...taken.texts);
      if (taken.truncated) {
        header.push("（本文件超出单文件/本章正文预算，后文未读）");
      }
    }
    const block = header.join("\n");
    deepParts.push(block);
    bodyUsed += block.length + 2;
  }

  parts.push(
    "",
    "【本章深读 · must-read 全文】",
    mustRead.length === 0
      ? "（未圈到与本章强相关的附件；只依据目录摘要，缺细节写待补。）"
      : "以下文件按本章任务圈选，尽量读全文。其它文件不要当成已读原文。",
  );
  if (unreadFull.length > 0) {
    parts.push(`未读全文（预算已满，仅见目录）：${unreadFull.join("、")}`);
  }
  if (deepParts.length > 0) {
    parts.push("", ...deepParts);
  }

  if (supplement.length > 0) {
    parts.push(
      "",
      "【相关段落补充 · 向量/关键词】",
      "从尚未深读的正文里按本章问题召回。不是该文件全文。",
    );
    const grouped = new Map<string, ChunkRow[]>();
    for (const c of supplement) {
      const list = grouped.get(c.document_id) ?? [];
      list.push(c);
      grouped.set(c.document_id, list);
    }
    for (const [docId, list] of grouped) {
      const doc = docsById.get(docId);
      const label = doc ? docLabel(doc) : (list[0]?.filename ?? docId);
      parts.push(`── 补充自：${label} ──`);
      for (const c of list) {
        const t = (c.text ?? "").trim();
        if (t) parts.push(t);
      }
    }
  }

  const digest = parts.join("\n");
  const namedSubjects =
    sectionId === "benchmarks"
      ? collectNamedSubjects(docs, byDoc, parseMap, mustReadIds, SECTION_FILE_BOOST.benchmarks)
      : [];
  return { digest, namedSubjects };
}

function collectNamedSubjects(
  docs: PackageDocMeta[],
  byDoc: Map<string, ChunkRow[]>,
  parseMap: Map<string, ParseLite>,
  mustReadIds: Set<string>,
  boostRe?: RegExp,
): string[] {
  const names = new Set<string>();
  for (const doc of docs) {
    const nameBlob = docSearchBlob(doc);
    const filenameHit = Boolean(boostRe?.test(nameBlob));
    if (filenameHit || mustReadIds.has(doc.id)) {
      for (const name of extractNamedSubjectsFromText("", {
        filenameBoost: nameBlob,
      })) {
        names.add(name);
      }
    }
    if (!mustReadIds.has(doc.id)) continue;
    const parsed = parseMap.get(doc.id);
    const blob = [
      nameBlob,
      parsed?.summary ?? "",
      parseKeyPoints(parsed?.key_points_json ?? null).join("\n"),
      firstChunksBlob(doc, byDoc),
      ...(byDoc.get(doc.id) ?? []).map((c) => (c.text ?? "").slice(0, 2_000)),
    ].join("\n");
    for (const name of extractNamedSubjectsFromText(blob, {
      filenameBoost: nameBlob,
    })) {
      names.add(name);
    }
  }
  return [...names].slice(0, 12);
}

function takeByChars(chunks: ChunkRow[], maxChars: number): ChunkRow[] {
  const out: ChunkRow[] = [];
  let n = 0;
  for (const c of chunks) {
    const len = (c.text ?? "").length;
    if (n > 0 && n + len > maxChars) break;
    out.push(c);
    n += len;
  }
  return out;
}

export async function rankSupplementChunks(
  env: EmbedEnv,
  pool: ChunkRow[],
  query: string,
  maxChars: number = VECTOR_SUPPLEMENT_CHARS,
  topK: number = VECTOR_TOP_K,
): Promise<ChunkRow[]> {
  if (pool.length === 0 || !query.trim()) return [];
  const embedded = pool.filter((c) => c.embedding && c.embedding.length > 0);
  if (embedded.length >= 3 && (env.DASHSCOPE_API_KEY || "").trim()) {
    try {
      const vectors = await embedTexts(env, [query.slice(0, 2000)]);
      const qVec = vectors[0];
      if (qVec?.length) {
        const ranked = scoreChunksByEmbedding(
          pool.map((c) => ({ row: c, embedding: c.embedding ?? null })),
          qVec,
          topK,
        );
        if (ranked.length > 0) return takeByChars(ranked, maxChars);
      }
    } catch {
      /* 关键词兜底 */
    }
  }
  return takeByChars(scoreChunks(pool, query, topK), maxChars);
}

/**
 * 章节生成资料：全量摘要目录 + 本章 must-read 全文 + 向量/关键词补相关 chunk。
 * 预算不够时先砍补充层，再缩短 must-read 后文；目录名单不截。
 */
export async function buildChapterGenerateMaterials(
  env: { DB: AppDatabase } & EmbedEnv,
  projectId: string,
  userId: string,
  options?: { sectionId?: string; extraQuery?: string },
): Promise<ChapterMaterialsBundle> {
  const docs = await listPackageDocuments(env.DB, projectId);
  if (docs.length === 0) {
    return {
      digest: [
        "【项目上传附件】",
        "（本项目资料包暂无上传附件；请在对应位置标注「待补」。）",
      ].join("\n"),
      namedSubjects: [],
    };
  }

  let allChunks: ChunkRow[] = [];
  try {
    allChunks = await loadChunks(env, projectId, userId, undefined);
  } catch {
    allChunks = [];
  }
  const byDoc = groupChunksByDocument(allChunks);
  const parseMap = await loadParseLites(
    env.DB,
    docs.map((d) => d.id),
  );

  const mustRead = selectMustReadDocs(
    docs,
    parseMap,
    byDoc,
    options?.sectionId,
    options?.extraQuery,
  );
  const mustReadIds = new Set(mustRead.map((d) => d.id));
  const usedChunkIds = new Set<string>();
  for (const doc of mustRead) {
    for (const c of byDoc.get(doc.id) ?? []) usedChunkIds.add(c.id);
  }

  const pool = allChunks.filter(
    (c) =>
      c.scope !== "session" &&
      !isPlaceholderChunkText(c.text) &&
      !usedChunkIds.has(c.id) &&
      !mustReadIds.has(c.document_id),
  );
  const supplement = await rankSupplementChunks(
    env,
    pool,
    chapterRetrievalQuery(options?.sectionId, options?.extraQuery),
  );

  return assembleChapterMaterialsDigest({
    docs,
    parseMap,
    byDoc,
    mustRead,
    supplement,
    sectionId: options?.sectionId,
  });
}

export async function buildChapterGenerateMaterialsDigest(
  env: { DB: AppDatabase } & EmbedEnv,
  projectId: string,
  userId: string,
  options?: { sectionId?: string; extraQuery?: string },
): Promise<string> {
  const bundle = await buildChapterGenerateMaterials(
    env,
    projectId,
    userId,
    options,
  );
  return bundle.digest;
}
