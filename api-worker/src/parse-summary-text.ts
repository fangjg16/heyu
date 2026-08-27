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
  const admitsScan = /扫描件|图片版/u.test(t);
  const admitsNoText =
    /未能提取可复制文字|未能从 PDF 提取|无法识别关键信息|需另附可复制|OCR 转录/u.test(t);
  return admitsScan && admitsNoText;
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
  if (looksLikeScanOcrNeededSummary(t) || looksLikeScanOcrNeededSummary(original)) {
    return true;
  }
  if (PLACEHOLDER_SUMMARY.test(t)) return false;
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
