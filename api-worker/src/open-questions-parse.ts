export type OpenQuestionPriority = "P1" | "P2" | "P3";

export type ParsedOpenQuestion = {
  text: string;
  priority: OpenQuestionPriority;
};

const PRIORITY_LABEL: Record<OpenQuestionPriority, string> = {
  P1: "P1 紧急",
  P2: "P2 重要",
  P3: "P3 跟进",
};

export function priorityLabel(p: OpenQuestionPriority): string {
  return PRIORITY_LABEL[p];
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

function detectPriority(summary: string): OpenQuestionPriority {
  const s = summary.toUpperCase();
  if (/\bP1\b|紧急/u.test(s) || s.includes("P1")) return "P1";
  if (/\bP3\b|跟进/u.test(s) || s.includes("P3")) return "P3";
  if (/\bP2\b|重要/u.test(s) || s.includes("P2")) return "P2";
  return "P2";
}

/** 去掉 ①② / 1. / （1） 等前导编号 */
function stripLeadingMarker(text: string): string {
  return text
    .replace(
      /^[\s]*(?:[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|[0-9１２３４５６７８９]+[.、．)]|[（(][0-9]+[）)])\s*/u,
      "",
    )
    .trim();
}

function isPlaceholderQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t === "待补" || /^待补[.。…]*$/u.test(t)) return true;
  if (t.length < 4) return true;
  if (/^（?待补）?$/u.test(t)) return true;
  const cleaned = t.replace(/[→\-–—|/]/gu, " ").replace(/\s+/gu, " ").trim();
  if (/^(待补[\s]*)+$/u.test(cleaned)) return true;
  return false;
}

function extractListItems(blockHtml: string): string[] {
  const out: string[] = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockHtml))) {
    const text = stripLeadingMarker(stripTags(m[1] ?? ""));
    if (!isPlaceholderQuestion(text)) out.push(text);
  }
  return out;
}

function extractParagraphs(blockHtml: string): string[] {
  const out: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockHtml))) {
    const text = stripLeadingMarker(stripTags(m[1] ?? ""));
    if (!isPlaceholderQuestion(text)) out.push(text);
  }
  return out;
}

function extractTableCells(blockHtml: string): string[] {
  const out: string[] = [];
  const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockHtml))) {
    const text = stripLeadingMarker(stripTags(m[1] ?? ""));
    if (!isPlaceholderQuestion(text)) out.push(text);
  }
  return out;
}

function detectGapUrgency(raw: string): OpenQuestionPriority {
  const s = raw.toUpperCase();
  if (/BLOCKING|阻断|P1|紧急/u.test(s)) return "P1";
  if (/ENHANCEMENT|增强|P3|跟进/u.test(s)) return "P3";
  if (/PRECISION|精度|P2|重要/u.test(s)) return "P2";
  return "P2";
}

/** 从 gap-tracking 缺口登记表抽出「缺口描述」，紧急度映射到 P1/P2/P3 */
function extractGapRegistry(html: string): ParsedOpenQuestion[] {
  const items: ParsedOpenQuestion[] = [];
  const tableRe = /<table\b[\s\S]*?<\/table>/giu;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html))) {
    const table = tm[0] ?? "";
    const headerRow = /<thead\b[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>/iu.exec(table);
    const headerHtml = headerRow?.[1] ?? "";
    const headers: string[] = [];
    const thRe = /<th\b[^>]*>([\s\S]*?)<\/th>/giu;
    let th: RegExpExecArray | null;
    while ((th = thRe.exec(headerHtml))) {
      headers.push(stripTags(th[1] ?? ""));
    }
    const descIdx = headers.findIndex((h) => /缺口描述|description/iu.test(h));
    if (descIdx < 0) continue;
    const urgencyIdx = headers.findIndex((h) => /紧急度|urgency/iu.test(h));
    const body = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu.exec(table)?.[1] ?? table;
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/giu;
    let tr: RegExpExecArray | null;
    while ((tr = trRe.exec(body))) {
      const cells: string[] = [];
      const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/giu;
      let td: RegExpExecArray | null;
      while ((td = tdRe.exec(tr[1] ?? ""))) {
        cells.push(stripTags(td[1] ?? ""));
      }
      const text = stripLeadingMarker(cells[descIdx] ?? "");
      if (isPlaceholderQuestion(text)) continue;
      const urgency = urgencyIdx >= 0 ? cells[urgencyIdx] ?? "" : "";
      items.push({ text, priority: detectGapUrgency(urgency) });
    }
  }
  return items;
}

/**
 * 从「待确认问题」章节 HTML 抽出具体问题（过滤「待补」占位）。
 */
export function parseOpenQuestionsFromHtml(html: string): ParsedOpenQuestion[] {
  const raw = (html ?? "").trim();
  if (!raw) return [];

  const items: ParsedOpenQuestion[] = [];
  const detailsRe =
    /<details\b[^>]*>([\s\S]*?)<\/details>/giu;
  let dm: RegExpExecArray | null;
  let foundDetails = false;

  while ((dm = detailsRe.exec(raw))) {
    foundDetails = true;
    const block = dm[1] ?? "";
    const summaryMatch = block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/iu);
    const priority = detectPriority(stripTags(summaryMatch?.[1] ?? ""));
    const body = block.replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/iu, "");
    const lis = extractListItems(body);
    const paras = extractParagraphs(body);
    const texts =
      lis.length > 0
        ? lis
        : paras.length > 0
          ? paras
          : extractTableCells(body);
    for (const text of texts) {
      items.push({ text, priority });
    }
  }

  if (!foundDetails) {
    const fromGap = extractGapRegistry(raw);
    if (fromGap.length > 0) return fromGap;
    const lis = extractListItems(raw);
    const paras = extractParagraphs(raw);
    const texts =
      lis.length > 0
        ? lis
        : paras.length > 0
          ? paras
          : extractTableCells(raw);
    for (const text of texts) {
      items.push({ text, priority: "P2" });
    }
  }

  return items;
}

export function priorityRank(p: OpenQuestionPriority): number {
  if (p === "P1") return 0;
  if (p === "P2") return 1;
  return 2;
}
