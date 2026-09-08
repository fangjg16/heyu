import { isPlainTextFileName } from "./file-mime";
import { truncateSummary } from "./parse-summary-text";

/** 去掉抽字头、代码围栏，保留可读正文。 */
export function stripSourceDecorations(text: string): string {
  let t = (text ?? "").replace(/^【[^\n]+】\n?/u, "").trim();
  t = t.replace(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)```$/iu, "$1").trim();
  return t;
}

function headingLines(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\n/u)) {
    const md = /^#{1,3}\s+(.+)$/u.exec(line.trim());
    if (md?.[1]) {
      const title = md[1].replace(/[*_`]/gu, "").trim();
      if (title) out.push(title);
      continue;
    }
    const zh = /^[一二三四五六七八九十]+[、.．]\s*(.+)$/u.exec(line.trim());
    if (zh?.[1]) {
      const title = zh[1].replace(/[*_`]/gu, "").trim();
      if (title) out.push(title);
    }
  }
  return out;
}

function leadParagraph(body: string): string {
  const lines = body
    .split(/\n/u)
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/u.test(l) && !/^[-*]\s*$/u.test(l));
  const joined = lines.join("\n").replace(/\n{2,}/gu, "\n");
  return joined.trim();
}

/** 已有正文时，卡片摘要从文本结构出，不再等模型。 */
export function digestPlainTextSource(input: {
  body: string;
  filename?: string;
  fileCategory?: string | null;
}): { summary: string; documentType: string; keyPoints: string[] } {
  const body = stripSourceDecorations(input.body);
  const keys = headingLines(body).slice(0, 8);
  const lead = leadParagraph(body);
  const summary = truncateSummary(lead || keys.join("；") || (input.filename ?? "").trim());
  const fromFile = (input.filename ?? "")
    .replace(/\.[^.]+$/u, "")
    .replace(/[-_]/gu, " ")
    .trim();
  const documentType = (
    (input.fileCategory ?? "").trim() ||
    keys[0] ||
    fromFile
  ).slice(0, 128);
  return { summary, documentType, keyPoints: keys };
}

/** 列表「已解析」：有摘要行，或纯文本已切块（检索已可用）。 */
export function documentListLooksParsed(input: {
  parseCount: number;
  chunkCount: number;
  filename: string;
  mime?: string | null;
}): boolean {
  if (input.parseCount > 0) return true;
  return input.chunkCount > 0 && isPlainTextFileName(input.filename, input.mime);
}
