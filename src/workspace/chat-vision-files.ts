/** 对话附件 / 源文件追问：扫描 PDF 与图片走视觉模型，请求里要带 documentId */

const VISION_NAME =
  /\.(pdf|png|jpe?g|jpe|gif|webp|bmp|tif{1,2}|heic)$/iu;

export function isChatVisionLookFile(name: string, mime?: string | null): boolean {
  if (VISION_NAME.test(name.trim())) return true;
  const m = (mime ?? "").toLowerCase();
  return m.startsWith("image/") || m === "application/pdf";
}

export function collectChatFileIds(
  ids: Array<string | null | undefined>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 图片/扫描 PDF 会由 qwen3-vl-plus 看图，不必再提示改传 txt */
export function shouldWarnUnparsedChatUpload(opts: {
  filename: string;
  mime?: string | null;
  parsed: boolean;
  chunks: number;
  pdfWarning?: string | null;
}): boolean {
  if (isChatVisionLookFile(opts.filename, opts.mime)) return false;
  return Boolean(opts.pdfWarning) || !opts.parsed || opts.chunks === 0;
}
