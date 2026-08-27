import type { AppObjectStorage } from "./app-storage";
import type { AppDatabase } from "./app-database";
import { invalidateChunkCache } from "./chunk-cache";
import {
  findDocumentIdByPath,
  fileStem,
  insertDocumentRow,
  joinRelative,
  r2KeyForUpload,
} from "./documents-persist";
import {
  extractDocumentText,
  type ExtractAttachment,
} from "./extract-document-text";
import { guessMimeFromFileName } from "./file-mime";
import type { LlmClientEnv } from "./llm-client";
import { chunkPlainText } from "./search";

const MAX_ATTACH_DEPTH = 3;

export type IngestEnv = {
  DB: AppDatabase;
  FILES: AppObjectStorage;
} & LlmClientEnv;

export type IngestedDoc = {
  documentId: string;
  parsed: boolean;
  needsOcr: boolean;
  chunkCount: number;
};

export type IngestResult = {
  text: string;
  parsed: boolean;
  needsOcr: boolean;
  warning?: string;
  chunkCount: number;
  jobs: IngestedDoc[];
};

export async function replaceDocumentChunks(
  env: IngestEnv,
  docId: string,
  text: string,
): Promise<number> {
  await env.DB.prepare(`DELETE FROM chunks WHERE document_id = ?`).bind(docId).run();
  const parts = chunkPlainText(text);
  for (let i = 0; i < parts.length; i++) {
    await env.DB.prepare(
      `INSERT INTO chunks (id, document_id, chunk_index, text) VALUES (?, ?, ?, ?)`,
    )
      .bind(`${docId}-${i}`, docId, i, parts[i])
      .run();
  }
  return parts.length;
}

async function persistEmlAttachments(
  env: IngestEnv,
  opts: {
    projectId: string;
    uploadedBy: string;
    conversationId: string | null;
    scope: string;
    parentFileName: string;
    parentRelativePath: string;
    attachments: ExtractAttachment[];
    allowOcr: boolean;
    depth: number;
    fetchImpl?: typeof fetch;
  },
): Promise<IngestedDoc[]> {
  const jobs: IngestedDoc[] = [];
  if (opts.depth >= MAX_ATTACH_DEPTH || opts.attachments.length === 0) return jobs;
  const folder = joinRelative(opts.parentRelativePath, `${fileStem(opts.parentFileName)}_附件`);

  for (const att of opts.attachments) {
    const mime = att.mimeType || guessMimeFromFileName(att.fileName);
    const existing = await findDocumentIdByPath(env, opts.projectId, folder, att.fileName);
    const copy = new Uint8Array(att.bytes.byteLength);
    copy.set(att.bytes);
    const bytes = copy.buffer;

    if (existing) {
      const child = await ingestExistingDocumentBytes(env, {
        docId: existing,
        projectId: opts.projectId,
        uploadedBy: opts.uploadedBy,
        conversationId: opts.conversationId,
        scope: opts.scope,
        fileName: att.fileName,
        mime,
        bytes,
        relativePath: folder,
        allowOcr: opts.allowOcr,
        persistAttachments: true,
        depth: opts.depth + 1,
        fetchImpl: opts.fetchImpl,
      });
      jobs.push(...child.jobs);
      continue;
    }

    const docId = crypto.randomUUID();
    const r2Key = r2KeyForUpload({
      projectId: opts.projectId,
      docId,
      fileName: att.fileName,
      scope: opts.scope,
      uploadedBy: opts.uploadedBy,
      conversationId: opts.conversationId,
    });
    await env.FILES.put(r2Key, bytes.byteLength > 0 ? bytes : new ArrayBuffer(0), {
      httpMetadata: { contentType: mime || "application/octet-stream" },
    });
    await insertDocumentRow(env, {
      id: docId,
      projectId: opts.projectId,
      conversationId: opts.conversationId,
      filename: att.fileName,
      relativePath: folder,
      r2Key,
      mime,
      byteSize: att.bytes.byteLength,
      scope: opts.scope,
      uploadedBy: opts.uploadedBy,
      createdAt: new Date().toISOString(),
    });
    const child = await ingestExistingDocumentBytes(env, {
      docId,
      projectId: opts.projectId,
      uploadedBy: opts.uploadedBy,
      conversationId: opts.conversationId,
      scope: opts.scope,
      fileName: att.fileName,
      mime,
      bytes,
      relativePath: folder,
      allowOcr: opts.allowOcr,
      persistAttachments: true,
      depth: opts.depth + 1,
      fetchImpl: opts.fetchImpl,
    });
    jobs.push(...child.jobs);
  }
  return jobs;
}

export async function ingestExistingDocumentBytes(
  env: IngestEnv,
  opts: {
    docId: string;
    projectId: string;
    uploadedBy: string;
    conversationId: string | null;
    scope: string;
    fileName: string;
    mime: string | null;
    bytes: ArrayBuffer;
    relativePath: string;
    allowOcr: boolean;
    persistAttachments: boolean;
    depth?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<IngestResult> {
  const depth = opts.depth ?? 0;
  const extracted = await extractDocumentText({
    bytes: opts.bytes,
    fileName: opts.fileName,
    mimeType: opts.mime,
    env,
    allowOcr: opts.allowOcr,
    depth,
    fetchImpl: opts.fetchImpl,
  });
  const chunkCount = await replaceDocumentChunks(env, opts.docId, extracted.text);
  await invalidateChunkCache(
    opts.projectId,
    opts.uploadedBy,
    opts.scope === "session" ? opts.conversationId ?? undefined : undefined,
  );

  let childJobs: IngestedDoc[] = [];
  if (opts.persistAttachments && extracted.attachments?.length) {
    childJobs = await persistEmlAttachments(env, {
      projectId: opts.projectId,
      uploadedBy: opts.uploadedBy,
      conversationId: opts.conversationId,
      scope: opts.scope,
      parentFileName: opts.fileName,
      parentRelativePath: opts.relativePath,
      attachments: extracted.attachments,
      allowOcr: opts.allowOcr,
      depth,
      fetchImpl: opts.fetchImpl,
    });
  }

  const self: IngestedDoc = {
    documentId: opts.docId,
    parsed: extracted.parsed,
    needsOcr: extracted.needsOcr,
    chunkCount,
  };

  return {
    text: extracted.text,
    parsed: extracted.parsed,
    needsOcr: extracted.needsOcr,
    warning: extracted.warning,
    chunkCount,
    jobs: [self, ...childJobs],
  };
}

export function shouldQueueParse(job: IngestedDoc): boolean {
  return job.needsOcr || (job.parsed && job.chunkCount > 0);
}

export function shouldEmbedNow(job: IngestedDoc): boolean {
  return job.parsed && !job.needsOcr && job.chunkCount > 0;
}
