export type ParseUiStatus = "unparsed" | "parsing" | "parsed" | "failed";

export type ParseCacheStatus = "parsed" | "failed" | "parsing";

/**
 * 真正在抽字/看图时才显示「解析中」。
 * 已解析文件点开拉缓存时保持「已解析」，不要闪成解析中。
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
  if (cacheStatus === "parsing") return "parsing";
  const inFlight = parsingId === fileId;
  if (inFlight && !dbParsed) return "parsing";
  if (dbParsed) return "parsed";
  if (inFlight) return "parsing";
  return "unparsed";
}

export function parseDetailPendingText(input: {
  ui: ParseUiStatus;
  dbParsed: boolean;
  inFlight?: boolean;
  forceRefresh?: boolean;
}): string | null {
  if (input.forceRefresh) return "正在重新解析…";
  if (input.ui === "parsing") return "正在解析…";
  if (input.inFlight && input.dbParsed) return "加载详情中…";
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
  if (/OCR 未抽出|OCR 失败|无法 OCR：/u.test(t)) return false;
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

/** 点刷新，或客户端已有一份该丢掉的旧摘要时，才带 refresh=1。空缓存不要重跑模型。 */
export function shouldSendParseRefresh(input: {
  force?: boolean;
  cachedSummary?: string;
}): boolean {
  if (input.force) return true;
  const s = (input.cachedSummary ?? "").trim();
  if (!s) return false;
  return shouldRefetchParseSummary(s);
}

export function formatMaterialsNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return "接口连不上或请求被中断。若刚重建过 API，等容器起来后再点刷新；大扫描 PDF 解析可能要几分钟。";
  }
  return msg.trim() || "未知错误";
}
