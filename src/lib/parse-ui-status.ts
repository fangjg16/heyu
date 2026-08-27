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

/** 点开源文件时是否丢掉缓存、再拉 parse-summary（扫描件改走视觉理解） */
export function shouldRefetchParseSummary(summary: string): boolean {
  const t = summary.trim();
  if (!t || t === "—") return true;
  if (t.startsWith("{") && /"summary"\s*:/u.test(t)) return true;
  if (/detached ArrayBuffer/iu.test(t)) return true;
  if (/未能把扫描件\/图片交给视觉模型阅读/u.test(t)) return true;
  if (/视觉理解未能读出图面/u.test(t)) return false;
  if (/OCR.{0,12}失败/u.test(t) && /未能获得任何文字|未提取到任何文字|未能抽出/u.test(t)) {
    return true;
  }
  if (/OCR 未抽出|OCR 失败|无法 OCR：/u.test(t)) return true;
  if (
    /扫描件|图片版/u.test(t) &&
    /未能提取可复制文字|未能从 PDF 提取|无法识别关键信息|需另附可复制|OCR 转录/u.test(t)
  ) {
    return true;
  }
  if (/[.。！？!?…]$/u.test(t)) return false;
  const n = Array.from(t).length;
  return n === 100 || n === 200;
}
