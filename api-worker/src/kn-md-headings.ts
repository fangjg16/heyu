/**
 * 从一份尽调 Markdown 里按标题切出知识网络二级 tab 要用的片段。
 * 匹配时忽略「2.」「一、」等编号前缀。
 */

const HEADING_RE = /^(#{1,3})\s+(.*)$/u;

export function normalizeKnHeading(raw: string): string {
  return String(raw ?? "")
    .replace(/^#+\s*/u, "")
    .replace(/^[0-9]+(?:\.[0-9]+)*\.?\s*/u, "")
    .replace(/^[一二三四五六七八九十百]+[、.．]\s*/u, "")
    .replace(/[「」『』《》]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
}

function headingMatches(raw: string, want: string): boolean {
  const a = normalizeKnHeading(raw);
  const b = normalizeKnHeading(want);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function extractMarkdownHeadingSlice(
  md: string,
  title: string,
): string {
  const want = title.trim();
  if (!want || !md.trim()) return "";
  const lines = md.split(/\r?\n/u);
  let start = -1;
  let startLevel = 2;
  for (let i = 0; i < lines.length; i += 1) {
    const m = HEADING_RE.exec(lines[i] ?? "");
    if (!m) continue;
    if (!headingMatches(m[2] ?? "", want)) continue;
    start = i;
    startLevel = m[1]!.length;
    break;
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = HEADING_RE.exec(lines[i] ?? "");
    if (m && m[1]!.length <= startLevel) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

export function extractMarkdownHeadingSlices(
  md: string,
  titles: readonly string[],
): string {
  if (!md.trim()) return "";
  if (!titles.length) return md.trim();
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const title of titles) {
    const slice = extractMarkdownHeadingSlice(md, title);
    if (!slice || seen.has(slice)) continue;
    seen.add(slice);
    parts.push(slice);
  }
  return parts.join("\n\n").trim();
}
