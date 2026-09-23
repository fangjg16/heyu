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

export type QuestionKind = "business" | "tech" | "finance" | "legal" | "other";

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  business: "业务",
  tech: "技术",
  finance: "财务",
  legal: "法务",
  other: "其他",
};

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
  "project-summary": ["概况", "主体", "阶段", "融资", "名称"],
  "industry-overview": ["行业", "定义", "规模", "增长"],
  "industry-demand": ["需求", "渗透", "驱动", "约束"],
  "industry-value-chain": ["价值链", "利润池", "产业链"],
  "industry-competition-structure": ["竞争", "参与者", "份额", "格局"],
  "industry-outlook": ["趋势", "技术", "监管"],
  "industry-competition": ["行业", "市场", "竞争", "规模", "供给"],
  "business-overview": ["业务", "边界", "客户"],
  "product-situation": ["产品", "功能"],
  "technology-situation": ["技术", "研发"],
  "commercial-model": ["商业模式", "定价", "交易"],
  "core-competitiveness": ["竞争力", "护城河", "能力"],
  "business-technology": ["业务", "模式", "客群", "单位经济", "技术"],
  "company-team": ["背景", "团队", "股权", "控制权", "主体"],
  "company-background": ["背景", "调查", "股权", "股东"],
  "financial-diligence": ["财务", "利润", "现金流", "收入", "尽调"],
  "investment-structure-returns": ["回报", "IRR", "结构", "收益", "估值"],
  "assumption-validation": ["声明", "假设", "主张", "审计"],
  "investment-risks": ["风险", "缓释", "矩阵", "威胁"],
  "risk-return": ["估值", "回报", "风险", "主张", "核验"],
  "diligence-gaps": [],
  "investment-conclusion": ["决策", "结论", "建议", "推荐"],
  "exec-verdict": ["结论", "闸门", "建议"],
  "decision-object": ["标的", "版本", "交易", "对象"],
  "business-worth-buying": ["业务", "值不值得", "客群", "模式"],
  "price-financing-downside": ["价格", "融资", "下行", "估值"],
  "buyer-fit-takeover": ["买方", "接管", "适配", "团队"],
  "acquisition-risk-register": ["风险", "缓释", "登记"],
  "open-items-exceptions": [],
  "counterarguments-invalidation": ["反论", "失效", "例外"],
  "recommendation-conditions": ["建议", "条件", "推荐"],
  "founder-interview": ["访谈", "创始人", "用户"],
  "market-discovery": ["市场", "竞争", "客户", "发现"],
  "exec-summary": ["摘要", "简报", "一句话"],
  "project-scorecard": ["评分", "总评"],
  "research-gate": ["结论", "继续", "假设"],
  "target-audience": ["客户", "客群", "痛点"],
  "market-analysis": ["市场", "规模", "切法"],
  "competitor-landscape": ["竞争", "竞品", "对手"],
  "industry-trends": ["趋势", "时机"],
  "lean-business-model": ["模式", "定价", "单位经济"],
  "value-proposition": ["价值", "痛点", "收益"],
  positioning: ["定位", "差异", "品类"],
  "go-to-market": ["获客", "渠道", "进入"],
  "mvp-definition": ["MVP", "首版", "范围"],
  "user-journey": ["旅程", "路径", "触点"],
  "feature-prioritization": ["功能", "优先级"],
  projections: ["预测", "现金流", "三年"],
  "revenue-model": ["收入", "定价"],
  "cost-structure": ["成本", "跑道"],
  "risk-analysis": ["风险", "缓释", "失败"],
  "assumptions-tracker": [],
  "validation-playbook": ["验证", "实验", "该停"],
  "action-plan-30d": ["行动", "下一步"],
  strategy: ["策略", "定位", "差异"],
  brand: ["品牌", "命名", "识别"],
  product: ["产品", "功能", "体验"],
  financials: ["财务", "收入", "成本", "预测"],
  validation: [],
};

/**
 * 为当前章节挑选最多 max 条关联问题：关键词命中优先，再按 P1→P2→P3 补足。
 */
export function pickRelatedOpenQuestions(
  sectionId: string,
  all: ParsedOpenQuestion[],
  max = 2,
): ParsedOpenQuestion[] {
  if (
    sectionId === "questions" ||
    sectionId === "diligence-gaps" ||
    sectionId === "open-items-exceptions" ||
    sectionId === "assumptions-tracker" ||
    sectionId === "validation" ||
    all.length === 0 ||
    max <= 0
  ) {
    return [];
  }

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
