/** 按 Unicode 码点截断（中文按字计）；优先在句号处断开 */
export const PARSE_SUMMARY_MAX_CHARS = 500;

const SENTENCE_END = /[.。！？!?…]$/u;
const PLACEHOLDER_SUMMARY =
  /未能生成可用摘要|暂未解析正文|模型未返回|文件夹占位|大模型解析失败|当前权限|无法解析|正在调用/u;

export function truncateSummary(
  text: string,
  max = PARSE_SUMMARY_MAX_CHARS,
): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join("");
  const head = chars.slice(0, max);
  for (let i = head.length - 1; i >= 24; i--) {
    if (head[i] === "。" || head[i] === "！" || head[i] === "？") {
      return head.slice(0, i + 1).join("");
    }
  }
  return head.join("");
}

/**
 * 旧摘要在说「这是扫描件、没抽到字」：OCR 上线后应丢弃缓存、重新抽字。
 * 不匹配「OCR 已经失败」的定稿，以免循环扣费。
 */
export function looksLikeScanOcrNeededSummary(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/OCR 未抽出|OCR 失败|无法 OCR：/u.test(t)) return false;
  const admitsScan = /扫描件|图片版|扫描 PDF/u.test(t);
  const admitsNoText =
    /未能提取可复制文字|未能从 PDF 提取|无法识别关键信息|需另附可复制|OCR 转录|未能获得任何文字|未提取到任何文字/u.test(
      t,
    );
  return admitsScan && admitsNoText;
}

/** 摘要模型把 OCR 失败文案扩写成投研段落：应丢弃缓存、允许再抽一次 */
export function looksLikeOcrEmptyLlmSummary(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/OCR 未抽出|无法 OCR：/u.test(t) && t.length < 80) return false;
  return /OCR.{0,12}失败/u.test(t) && /未能获得任何文字|未提取到任何文字|未能抽出/u.test(t);
}

/** GET parse-summary?refresh=1 时丢掉已有摘要，重新跑抽字/看图 */
export function parseSummaryRefreshRequested(
  searchParams: { get(name: string): string | null },
): boolean {
  const raw = (
    searchParams.get("refresh") ??
    searchParams.get("force") ??
    ""
  )
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** 检索块/摘要还在说 OCR 失败：不能当可用正文，也不能当看图失败后的成功回退 */
export function looksLikeOcrFailureContent(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return looksLikeOcrEmptyLlmSummary(t) || looksLikeScanOcrNeededSummary(t);
}

/**
 * 刷新只丢掉摘要缓存，不代表必须看图。
 * 看图仅用于：图片，或旧摘要/检索块仍是 OCR 失败扩写（测绘图那类扫描件）。
 * 可复制 PDF / Word / 邮件仍走抽字 + 文本模型。
 */
export function shouldPreferVisionForParse(input: {
  isImage?: boolean;
  cachedSummary?: string;
  existingText?: string;
}): boolean {
  if (input.isImage) return true;
  if (looksLikeOcrFailureContent(input.cachedSummary ?? "")) return true;
  if (looksLikeOcrFailureContent(input.existingText ?? "")) return true;
  return false;
}

/**
 * 看图/摘要模型失败时，不要把「OCR 失败扩写」当成解析成功交回去。
 * 否则点刷新会瞬间回到同一段文案，看起来像没重新解析。
 */
export function shouldReturnCachedSummaryOnLlmError(
  cachedSummary: string | undefined,
  forceRefresh: boolean,
): boolean {
  if (forceRefresh) return false;
  const t = (cachedSummary ?? "").trim();
  if (!t) return false;
  if (looksLikeOcrFailureContent(t)) return false;
  if (/OCR 未抽出|OCR 失败|无法 OCR：/u.test(t)) return false;
  return true;
}

/** 旧版 100 字硬截、残缺 JSON、或 VARCHAR 截断：点开时应重跑解析 */
export function shouldRefreshCachedSummary(raw: string): boolean {
  const original = (raw ?? "").trim();
  if (!original) return true;
  if (looksLikeRawParseJson(original)) return true;
  const t = normalizeParseSummaryText(original);
  if (!t) return true;
  if (/detached ArrayBuffer/iu.test(original) || /detached ArrayBuffer/iu.test(t)) {
    return true;
  }
  if (looksLikeOcrEmptyLlmSummary(t) || looksLikeOcrEmptyLlmSummary(original)) {
    return true;
  }
  if (looksLikeScanOcrNeededSummary(t) || looksLikeScanOcrNeededSummary(original)) {
    return true;
  }
  if (PLACEHOLDER_SUMMARY.test(t) && !/OCR 未抽出|OCR 失败|无法 OCR：/u.test(t)) {
    return false;
  }
  if (/视觉理解未能读出图面/u.test(t) || /视觉理解未能读出图面/u.test(original)) {
    return false;
  }
  if (/OCR 未抽出|OCR 失败|无法 OCR：/u.test(t) || /OCR 未抽出|OCR 失败|无法 OCR：/u.test(original)) {
    if (/detached ArrayBuffer/iu.test(original) || /detached ArrayBuffer/iu.test(t)) {
      return true;
    }
    return true;
  }
  if (SENTENCE_END.test(t)) return false;
  const n = Array.from(t).length;
  return n === 100 || n === 200;
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw
      .replace(/\\"/gu, '"')
      .replace(/\\n/gu, "\n")
      .replace(/\\\\/gu, "\\");
  }
}

/** 下一个 JSON 字段：`","documentType` 或残缺的 `","do` */
const NEXT_JSON_FIELD = /"\s*,\s*"[A-Za-z_][A-Za-z0-9_]*/u;

/**
 * 从残缺 JSON 里抽出 summary 字段。
 * 模型常在中文里写未转义的 `"前九稿红利"`，不能按第一个 `"` 截断。
 */
export function extractSummaryField(raw: string): string {
  const key = /"summary"\s*:/iu.exec(raw);
  if (!key) return "";
  const afterKey = raw.slice(key.index + key[0].length);
  const quote = afterKey.search(/"/u);
  if (quote < 0) return "";
  const rest = afterKey.slice(quote + 1);

  const next = NEXT_JSON_FIELD.exec(rest);
  if (next) {
    return unescapeJsonString(rest.slice(0, next.index)).trim();
  }

  const closed = /^((?:\\.|[^"\\])*)"/u.exec(rest);
  if (closed?.[1] != null) {
    return unescapeJsonString(closed[1]).trim();
  }

  return unescapeJsonString(rest.replace(/\s*"\s*$/u, "").trim()).trim();
}

export function looksLikeRawParseJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") && /"summary"\s*:/u.test(t);
}

export function normalizeParseSummaryText(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (looksLikeRawParseJson(t)) {
    const extracted = extractSummaryField(t);
    if (extracted) return truncateSummary(extracted);
    return "未能生成可用摘要，请直接预览原文。";
  }
  return truncateSummary(t);
}
