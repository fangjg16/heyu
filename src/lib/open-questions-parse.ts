/** 与 api-worker/src/open-questions-parse.ts 规则对齐（前端侧栏用） */

export type OpenQuestionPriority = "P1" | "P2" | "P3";

export type ParsedOpenQuestion = {
  text: string;
  priority: OpenQuestionPriority;
};

const PRIORITY_LABEL: Record<OpenQuestionPriority, string> = {
  P1: "P1",
  P2: "P2",
  P3: "P3",
};

export function priorityLabel(p: OpenQuestionPriority): string {
  return PRIORITY_LABEL[p];
}

export function priorityRank(p: OpenQuestionPriority): number {
  if (p === "P1") return 0;
  if (p === "P2") return 1;
  return 2;
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

function stripCollabWriteback(html: string): string {
  return html
    .replace(
      /<div\b[^>]*class="[^"]*kn-collab-confirmed[^"]*"[^>]*>[\s\S]*?<\/div>/giu,
      " ",
    )
    .replace(
      /<section\b[^>]*class="[^"]*kn-collab-writeback[^"]*"[^>]*>[\s\S]*?<\/section>/giu,
      " ",
    );
}

export function parseOpenQuestionsFromHtml(html: string): ParsedOpenQuestion[] {
  const raw = stripCollabWriteback(html ?? "").trim();
  if (!raw) return [];

  const items: ParsedOpenQuestion[] = [];
  const detailsRe = /<details\b[^>]*>([\s\S]*?)<\/details>/giu;
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

export type QuestionKind = "business" | "tech" | "finance" | "other";

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  business: "业务",
  tech: "技术",
  finance: "财务",
  other: "其他",
};

const KIND_KEYWORDS: Record<Exclude<QuestionKind, "other">, string[]> = {
  business: ["业务", "模式", "客群", "市场", "客户", "销售", "运营", "商业"],
  tech: ["技术", "电芯", "工艺", "系统", "设备", "专利", "效率", "寿命", "功率", "热管理"],
  finance: ["财务", "回报", "IRR", "估值", "收入", "利润", "现金流", "成本", "融资", "造价"],
};

export function inferQuestionKind(text: string): QuestionKind {
  const hay = text.toLowerCase();
  const score = (kws: string[]) =>
    kws.reduce((n, kw) => (hay.includes(kw.toLowerCase()) ? n + 1 : n), 0);
  const business = score(KIND_KEYWORDS.business);
  const tech = score(KIND_KEYWORDS.tech);
  const finance = score(KIND_KEYWORDS.finance);
  const max = Math.max(business, tech, finance);
  if (max === 0) return "other";
  if (finance === max) return "finance";
  if (tech === max) return "tech";
  return "business";
}

/** 章节 → 关联问题关键词 */
const SECTION_QUESTION_KEYWORDS: Record<string, string[]> = {
  snapshot: ["快照", "概况", "主体", "阶段", "融资", "对手方", "名称"],
  objectives: ["标的", "门槛", "估值", "交易", "目标", "判断"],
  industry: ["行业", "市场", "竞争", "规模", "供给", "监管时间"],
  legal: ["合规", "监管", "资质", "路径", "执法", "政策", "法律"],
  benchmarks: ["对标", "可比", "定价", "范式", "竞品"],
  business: ["业务", "模式", "客群", "单位经济", "路径", "可行性"],
  returns: ["财务", "回报", "利润", "IRR", "现金流", "收入"],
  capabilities: ["资源", "网络", "通道", "关系", "渠道"],
  ownership: ["背景", "股权", "控制权", "主体", "合同权利", "权属"],
  diligence: ["尽调", "尽职", "覆盖", "清单", "缺口"],
  risks: ["风险", "缓释", "矩阵", "威胁"],
  questions: [],
  framework: ["决策", "结构", "路径比较", "行动", "法律结构", "推荐"],
};

/**
 * 为当前章节挑选最多 max 条关联问题：关键词命中优先，再按 P1→P2→P3 补足。
 */
export function pickRelatedOpenQuestions(
  sectionId: string,
  all: ParsedOpenQuestion[],
  max = 2,
): ParsedOpenQuestion[] {
  if (sectionId === "questions" || all.length === 0 || max <= 0) return [];

  const keywords = SECTION_QUESTION_KEYWORDS[sectionId] ?? [];
  const scored = all.map((q, idx) => {
    const hay = q.text.toLowerCase();
    let hit = 0;
    for (const kw of keywords) {
      if (kw && hay.includes(kw.toLowerCase())) hit += 1;
    }
    return { q, idx, hit, rank: priorityRank(q.priority) };
  });

  scored.sort((a, b) => {
    if (b.hit !== a.hit) return b.hit - a.hit;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.idx - b.idx;
  });

  const picked: ParsedOpenQuestion[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    if (picked.length >= max) break;
    const key = row.q.text;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(row.q);
  }
  return picked;
}
