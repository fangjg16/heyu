export type ParseUiStatus = "unparsed" | "parsing" | "parsed" | "failed";

export type ParseCacheStatus = "parsed" | "failed" | "parsing";

/**
 * 请求进行中一律显示「解析中」。
 * 扫描 PDF 上传时可能已被标 parsed（等待 OCR），不能因此把首次 OCR 显示成已解析。
 */
export function resolveParseUiStatus(input: {
  fileId: string;
  parsingId: string | null;
  cacheStatus?: ParseCacheStatus;
  dbParsed: boolean;
}): ParseUiStatus {
  const { fileId, parsingId, cacheStatus, dbParsed } = input;
  if (cacheStatus === "parsed") return "parsed";
  if (cacheStatus === "failed") return "failed";
  const inFlight = parsingId === fileId || cacheStatus === "parsing";
  if (inFlight) return "parsing";
  if (dbParsed) return "parsed";
  return "unparsed";
}

export function parseDetailPendingText(input: {
  ui: ParseUiStatus;
  dbParsed: boolean;
}): string | null {
  if (input.ui === "parsing") return "正在解析…";
  if (input.dbParsed) return "加载详情中…";
  return null;
}
