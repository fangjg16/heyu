import type { AppDatabase } from "./app-database";
import { loadChunks } from "./chat-data";
import { isDirectoryMarker } from "./documents-access";
import { isPlaceholderChunkText, type ChunkRow } from "./search";

/** 章节生成：尽量覆盖项目资料包全部上传附件（非整库机械全文，但按文件均摊） */
const TOTAL_MAX_CHARS = 90_000;
const PER_FILE_MAX_CHARS = 14_000;

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

/**
 * 「更新本章」专用：基于当前项目资料包全部上传附件构建摘要。
 * - 文件清单全量列出
 * - 已有解析结果的摘要/要点尽量纳入
 * - 正文 chunk 按文件均摊预算，尽量覆盖每个附件（非只做相关检索 Top-K）
 */
export async function buildChapterGenerateMaterialsDigest(
  env: { DB: AppDatabase },
  projectId: string,
  userId: string,
): Promise<string> {
  const docs = await listPackageDocuments(env.DB, projectId);
  if (docs.length === 0) {
    return [
      "【项目上传附件】",
      "（本项目资料包暂无上传附件；请在对应位置标注「待补」。）",
    ].join("\n");
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

  const inventoryLines = docs.map((d, i) => {
    const path = (d.relative_path ?? "").trim();
    const label = path ? `${path}/${d.filename}` : d.filename;
    const hasChunks = (byDoc.get(d.id)?.length ?? 0) > 0;
    const hasParse = parseMap.has(d.id);
    const flags = [
      hasParse ? "已解析" : "未解析",
      hasChunks ? "有正文" : "无正文",
    ].join("·");
    return `${i + 1}. ${label}（${flags}）`;
  });

  const parts: string[] = [
    "【项目上传附件 · 全量清单】",
    `共 ${docs.length} 个文件；以下摘录覆盖全部附件（按文件均摊，超出预算则截断）。`,
    "生成章节时必须综合这些附件中的事实；无依据处写「待补」，禁止编造。",
    "",
    ...inventoryLines,
    "",
    "【各附件内容摘录】",
  ];

  let totalUsed = 0;
  const fileBudget = Math.min(
    PER_FILE_MAX_CHARS,
    Math.max(2_500, Math.floor(TOTAL_MAX_CHARS / Math.max(1, docs.length))),
  );

  for (const doc of docs) {
    if (totalUsed >= TOTAL_MAX_CHARS) {
      parts.push("", "（总预算已满，后续附件仅列清单未再附正文）");
      break;
    }

    const path = (doc.relative_path ?? "").trim();
    const label = path ? `${path}/${doc.filename}` : doc.filename;
    const block: string[] = [`── 文件：${label} ──`];

    const parsed = parseMap.get(doc.id);
    if (parsed) {
      if (parsed.document_type?.trim()) {
        block.push(`类型：${parsed.document_type.trim()}`);
      }
      if (parsed.summary?.trim()) {
        block.push(`摘要：${parsed.summary.trim()}`);
      }
      const points = parseKeyPoints(parsed.key_points_json);
      if (points.length > 0) {
        block.push("要点：");
        for (const p of points) block.push(`- ${p}`);
      }
    }

    const chunks = byDoc.get(doc.id) ?? [];
    let fileUsed = block.join("\n").length;
    if (chunks.length > 0) {
      block.push("正文摘录：");
      for (const c of chunks) {
        const piece = (c.text ?? "").trim();
        if (!piece) continue;
        const room = Math.min(
          fileBudget - fileUsed,
          TOTAL_MAX_CHARS - totalUsed,
        );
        if (room <= 80) break;
        const take = piece.length > room ? `${piece.slice(0, room)}…` : piece;
        block.push(take);
        fileUsed += take.length + 1;
        if (fileUsed >= fileBudget) break;
      }
    } else if (!parsed?.summary?.trim()) {
      block.push(
        "（尚无解析摘要与正文 chunk，生成时对该文件相关事实标「待补」）",
      );
    }

    const text = block.join("\n");
    parts.push("", text);
    totalUsed += text.length;
  }

  return parts.join("\n");
}
