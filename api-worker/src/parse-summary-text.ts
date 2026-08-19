/** 按 Unicode 码点截断（中文按字计） */
export const PARSE_SUMMARY_MAX_CHARS = 280;

export function truncateSummary(
  text: string,
  max = PARSE_SUMMARY_MAX_CHARS,
): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max).join("");
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
