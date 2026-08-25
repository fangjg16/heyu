export type ParseUiStatus = "unparsed" | "parsing" | "parsed" | "failed";

export type ParseCacheStatus = "parsed" | "failed" | "parsing";

/** 仅「库里还没有解析结果、正在第一次跑模型」时为 parsing */
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
  if (inFlight) return dbParsed ? "parsed" : "parsing";
  if (dbParsed) return "parsed";
  return "unparsed";
}

export function parseDetailPendingText(input: {
  ui: ParseUiStatus;
  dbParsed: boolean;
}): string | null {
  if (input.ui === "parsing") return "正在调用大模型解析…";
  if (input.dbParsed) return "加载详情中…";
  return null;
}
