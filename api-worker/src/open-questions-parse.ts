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

/**
 * 把 <strong>标题</strong> + 说明 还原成「标题： 正文」，
 * 避免 stripTags 把标题和正文拍成一句后只能靠字数硬裁。
 */
function flattenQuestionItemHtml(innerHtml: string): string {
  const html = innerHtml ?? "";
  const strongMatch = /<strong\b[^>]*>([\s\S]*?)<\/strong>/iu.exec(html);
  if (strongMatch) {
    const title = stripLeadingMarker(stripTags(strongMatch[1] ?? ""));
    const rest = stripLeadingMarker(stripTags(html.replace(strongMatch[0], " ")));
    if (title && rest && !rest.startsWith(title)) return `${title}： ${rest}`;
    return rest || title;
  }

  const chunks = html
    .split(/<br\s*\/?>/iu)
    .map((part) => stripLeadingMarker(stripTags(part)))
    .filter(Boolean);
  if (chunks.length >= 2) {
    const [head, ...tail] = chunks;
    const rest = tail.join(" ");
    if (
      head.length >= 4 &&
      head.length <= 40 &&
      rest.length > head.length &&
      !rest.startsWith(head)
    ) {
      return `${head}： ${rest}`;
    }
  }

  return stripLeadingMarker(stripTags(html));
}

function extractListItems(blockHtml: string): string[] {
  const out: string[] = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockHtml))) {
    const text = flattenQuestionItemHtml(m[1] ?? "");
    if (!isPlaceholderQuestion(text)) out.push(text);
  }
  return out;
}

function extractParagraphs(blockHtml: string): string[] {
  const out: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blockHtml))) {
    const text = flattenQuestionItemHtml(m[1] ?? "");
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

export type QuestionKind = "business" | "tech" | "finance" | "legal" | "other";

/** 「技术人员」等角色词不是技术类问题，先挖掉再匹配主题。 */
const ROLE_COMPOUND_RE =
  /(?:核心)?(?:技术|业务|财务|法务|运营|产品)(?:人员|团队|负责人|合伙人|顾问|总监|经理|骨干|人才|同事|出身|背景)/gu;

const LEGAL_THEME_RE =
  /企查查|天眼查|工商(?:档案|登记|信息)?|股权|股东|持股|代持|实控人|\bubo\b|权属|章程|注册资本|主体资格|出资|授权|牌照|著作权|版权|知识产权|商标权|使用权|所有权|权利人|合同|协议|诉讼|仲裁|合规|监管资质|归属确认|资产归属|收入归属|核心资产.{0,12}归属|许可(?!证号)/iu;
const FINANCE_THEME_RE =
  /\birr\b|估值|利润|现金流|收益分配|费用瀑布|瀑布|募集资金|募资|造价|财务|回报|资金用途|基金方案|融资(?!协议)|收入(?!归属)/iu;
const TECH_THEME_RE =
  /小模型|大模型|\bskills?\b|算法|架构|自研|评测|\bapi\b|电芯|工艺|热管理|技术处理|技术路线|技术主张|第三方模型|模型|平台|专利(?!转让)|系统/iu;
const BUSINESS_THEME_RE =
  /商业模式|客群|市场|销售|产品规划|路线图|短剧业务|获客|艺人|数字人|内容|规模|取舍|业务|产品|规划|模式|客户|运营/iu;

function themeHead(text: string): string {
  const first = (text.split(/\n/u)[0] ?? text).trim();
  return (first.split(/[：:]/u)[0] ?? first).trim().slice(0, 80);
}

function countThemeHits(hay: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return hay.match(new RegExp(re.source, flags))?.length ?? 0;
}

export function parseQuestionKind(raw: unknown): QuestionKind | null {
  if (
    raw === "business" ||
    raw === "tech" ||
    raw === "finance" ||
    raw === "legal" ||
    raw === "other"
  ) {
    return raw;
  }
  return null;
}

/** 看整题主题（标题优先），股权 / 企查查 / 授权等归法务，不让「收入」「业务」单字抢走。 */
export function inferQuestionKind(text: string): QuestionKind {
  const hay = (text ?? "").replace(ROLE_COMPOUND_RE, " ");
  const head = themeHead(hay);
  if (LEGAL_THEME_RE.test(head)) return "legal";
  const score = (re: RegExp) =>
    countThemeHits(head, re) * 3 + countThemeHits(hay, re);
  const legal = score(LEGAL_THEME_RE);
  const finance = score(FINANCE_THEME_RE);
  const tech = score(TECH_THEME_RE);
  const business = score(BUSINESS_THEME_RE);
  const max = Math.max(legal, finance, tech, business);
  if (max === 0) return "other";
  if (legal === max) return "legal";
  if (finance === max) return "finance";
  if (tech === max) return "tech";
  return "business";
}
