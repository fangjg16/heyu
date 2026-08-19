/** 按 Unicode 码点截断（中文按字计） */
export function truncateSummary(text: string, max = 100): string {
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

/** 从残缺 JSON 里抽出 summary 字段，避免把整段 `{"summary":...` 展示给用户 */
export function extractSummaryField(raw: string): string {
  const m = /"summary"\s*:\s*"((?:\\.|[^"\\])*)"/u.exec(raw);
  if (!m?.[1]) return "";
  return unescapeJsonString(m[1]).trim();
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
