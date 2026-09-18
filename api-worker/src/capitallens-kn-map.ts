/**
 * CapitalLens 知识网络：按工作流把底稿装配成七章报告。
 * 筛选：screening-memo 是报告骨架，brief / theme / enrichment 按子节填入。
 * 尽调：专章底稿整份进入，不把筛选备忘录叠进去。
 * 表里的子节是必有内容，不是白名单——多出来的内容留在同一子节。
 */
import {
  extractMarkdownHeadingSlice,
  extractMarkdownHeadingSlices,
  extractNumberedMarkdownChapter,
} from "./kn-md-headings";
import type { PipelineStage } from "./pipeline-stage";

export type KnWorkstream = "screening" | "diligence";

export type KnSourceSpec = {
  readonly fileId: string;
  /** 多章报告/备忘录按编号切 */
  readonly numberedChapter?: number;
  /** 一份底稿喂多章时按标题切；切不到则该条为空，除非 fallbackWhole */
  readonly headings?: readonly string[];
  /** 写入报告的子节号，如 2.1；不设则作为该章备忘录正文 */
  readonly into?: string;
  /** 标题切空时，把去掉封面后的整份底稿写入该子节（每章每份底稿最多一处） */
  readonly fallbackWhole?: boolean;
};

const MEMO = "screening-memo";
const REPORT = "investment-analysis-report";
const BRIEF = "brief";
const THEME = "theme";
const ENRICH = "enrichment";

function memoChapter(
  n: number,
  headings: readonly string[],
): KnSourceSpec {
  return { fileId: MEMO, numberedChapter: n, headings };
}

function into(
  fileId: string,
  subsection: string,
  headings: readonly string[],
  fallbackWhole = false,
): KnSourceSpec {
  return { fileId, into: subsection, headings, fallbackWhole };
}

const WAVE1 = [
  "Wave 1",
  "Market landscape",
  "市场格局",
  "行业概况",
  "行业规模",
  "市场现状",
];
const WAVE1_DEMAND = ["需求", "痛点", "付费意愿", "预算"];
const WAVE1_CHAIN = ["产业链", "价值链", "value chain", "利润环节"];
const WAVE1_TIMING = ["发展趋势", "时机", "监管", "timing", "催化"];
const WAVE2 = [
  "Wave 2",
  "Competitive",
  "竞争替代",
  "竞争结构",
  "替代方案",
  "没有竞争",
];
const WAVE3 = [
  "Wave 3",
  "Customer and demand",
  "客户与需求",
  "付费",
  "订单",
  "试点",
];
const WAVE4 = ["Wave 4", "Distribution", "渠道", "市场进入", "获客"];
const SYNTHESIS = [
  "Synthesis",
  "综合",
  "评分",
  "总体评级",
  "三维",
  "矛盾",
  "未知",
  "待确认",
];
const BRIEF_FACTS = [
  "经济实质",
  "产品",
  "客户",
  "融资",
  "阶段",
  "项目基本情况",
  "一句话",
];
const BRIEF_BIZ = ["业务", "产品", "客户", "定价", "交付", "收款"];
const BRIEF_CO = ["公司", "主体", "股权", "融资历史", "团队", "创始人"];
const BRIEF_FIN = ["财务", "收入", "预测", "口径", "利润", "现金流"];

/** 尽调流水线阶段。筛选/准入/不投都按筛选装配，不因资料包里已有尽调文件就抢跑。 */
export const DILIGENCE_PIPELINE_STAGES: readonly PipelineStage[] = [
  "due-diligence",
  "ic-review",
  "invested",
];

export const SCREENING_KN_SOURCES: Readonly<
  Record<string, readonly KnSourceSpec[]>
> = {
  "project-summary": [
    memoChapter(1, [
      "项目概览",
      "项目概况",
      "初筛结论",
      "项目基本情况",
    ]),
    into(ENRICH, "1.1", SYNTHESIS),
    into(BRIEF, "1.2", BRIEF_FACTS, true),
    into(THEME, "1.2", ["主分类", "投资主题", "赛道", "经济实质"], true),
  ],
  "industry-competition": [
    memoChapter(2, ["行业与竞争"]),
    into(ENRICH, "2.1", WAVE1, true),
    into(ENRICH, "2.2", [...WAVE1_DEMAND, ...WAVE3]),
    into(ENRICH, "2.3", WAVE1_CHAIN),
    into(ENRICH, "2.4", WAVE2),
    into(ENRICH, "2.5", [...WAVE1_TIMING, ...WAVE4]),
  ],
  "business-technology": [
    memoChapter(3, ["业务与技术"]),
    into(BRIEF, "3.1", BRIEF_BIZ, true),
    into(ENRICH, "3.2", ["核心能力", "性能", "成本", "交付证据", "能力佐证"]),
    into(ENRICH, "3.3", WAVE3, true),
    into(ENRICH, "3.4", WAVE4),
    into(ENRICH, "3.5", ["疑点", "矛盾", "尚未证实", ...SYNTHESIS]),
  ],
  "company-team": [
    memoChapter(4, ["公司与团队"]),
    into(BRIEF, "4.1", BRIEF_CO, true),
    into(BRIEF, "4.2", ["团队", "创始人", "经历", "职责"]),
    into(ENRICH, "4.4", ["身份", "控制权", "关联方", "负面"]),
  ],
  "financial-diligence": [
    memoChapter(5, ["财务分析"]),
    into(BRIEF, "5.1", BRIEF_FIN, true),
    into(BRIEF, "5.2", BRIEF_FIN),
    into(ENRICH, "5.3", ["价格", "需求", "渠道", ...WAVE3, ...WAVE4]),
  ],
  "risk-return": [
    memoChapter(6, ["风险与回报"]),
    into(BRIEF, "6.1", ["回报", "融资", "退出", "交易"]),
    into(ENRICH, "6.2", ["风险", "矛盾", ...SYNTHESIS], true),
    into(ENRICH, "6.3", ["催化", "阻断", "推进", "待确认"]),
  ],
  "diligence-gaps": [
    memoChapter(7, ["待解决问题"]),
    into(ENRICH, "7.1", ["待确认", "开放问题", "未知", "不清楚"], true),
    into(THEME, "7.1", ["待确认"]),
    into(ENRICH, "7.2", ["内部", "待办", "核查"]),
    into(BRIEF, "7.2", ["未知", "待确认", "缺口"]),
  ],
};

export const DILIGENCE_KN_SOURCES: Readonly<
  Record<string, readonly KnSourceSpec[]>
> = {
  "project-summary": [
    {
      fileId: REPORT,
      numberedChapter: 1,
      headings: [
        "项目概况",
        "项目概览",
        "投资结论",
        "项目摘要",
        "交易结构",
        "交易",
      ],
    },
    { fileId: "brief" },
    { fileId: "theme" },
  ],
  "industry-competition": [{ fileId: "industry-due-diligence" }],
  "business-technology": [{ fileId: "business-due-diligence" }],
  "company-team": [
    { fileId: "company-team-qcc" },
    { fileId: "brief" },
    {
      fileId: "business-due-diligence",
      headings: [
        "运营、组织与关键依赖",
        "公司与团队",
        "公司基本信息",
        "团队与治理",
        "核心团队",
        "团队匹配",
      ],
    },
    { fileId: "background-check" },
  ],
  "financial-diligence": [{ fileId: "financial-due-diligence" }],
  "risk-return": [
    { fileId: "returns" },
    { fileId: "claim-audit" },
    { fileId: "risk-matrix" },
  ],
  "diligence-gaps": [{ fileId: "gaps" }, { fileId: "dd-checklist" }],
};

export function capitallensKnSources(
  workstream: KnWorkstream,
  sectionId: string,
): readonly KnSourceSpec[] {
  const map =
    workstream === "diligence" ? DILIGENCE_KN_SOURCES : SCREENING_KN_SOURCES;
  return map[sectionId] ?? [];
}

export type KnFloorSubsection = {
  readonly id: string;
  readonly title: string;
};

export type KnChapterFloor = {
  readonly chapter: number;
  readonly title: string;
  readonly subsections: readonly KnFloorSubsection[];
};

function floor(
  chapter: number,
  title: string,
  subsections: readonly KnFloorSubsection[],
): KnChapterFloor {
  return { chapter, title, subsections };
}

/** 筛选知识网络每章必有子节（下限，不是白名单）。 */
export const SCREENING_KN_FLOORS: Readonly<Record<string, KnChapterFloor>> = {
  "project-summary": floor(1, "项目概览", [
    { id: "1.1", title: "初筛结论" },
    { id: "1.2", title: "项目基本情况" },
  ]),
  "industry-competition": floor(2, "行业与竞争", [
    { id: "2.1", title: "行业概况" },
    { id: "2.2", title: "市场需求" },
    { id: "2.3", title: "产业链" },
    { id: "2.4", title: "竞争结构" },
    { id: "2.5", title: "发展趋势" },
  ]),
  "business-technology": floor(3, "业务与技术", [
    { id: "3.1", title: "业务概览" },
    { id: "3.2", title: "核心能力" },
    { id: "3.3", title: "商业化进展" },
    { id: "3.4", title: "渠道拓展" },
    { id: "3.5", title: "关键疑点" },
  ]),
  "company-team": floor(4, "公司与团队", [
    { id: "4.1", title: "公司概况" },
    { id: "4.2", title: "核心团队" },
    { id: "4.3", title: "团队匹配" },
    { id: "4.4", title: "核查线索" },
  ]),
  "financial-diligence": floor(5, "财务分析", [
    { id: "5.1", title: "数据口径" },
    { id: "5.2", title: "数据或测算" },
    { id: "5.3", title: "关键假设" },
    { id: "5.4", title: "分析局限" },
  ]),
  "risk-return": floor(6, "风险与回报", [
    { id: "6.1", title: "回报来源" },
    { id: "6.2", title: "风险信号" },
    { id: "6.3", title: "推进条件" },
  ]),
  "diligence-gaps": floor(7, "待解决问题", [
    { id: "7.1", title: "对方待答" },
    { id: "7.2", title: "内部待办" },
  ]),
};

const THEME_DUMP_RE = /(?:^|\n)\s*(?:\*\*)?主分类(?:\*\*)?\s*[：:]/u;
const WORKPAPER_TITLE_RE =
  /^(?:赛道确认|赛道|公开补充要点|公开信息补充|投资主题)/u;

/** 主题分类 / 公开补充稿不能整份顶替筛选备忘录章节。 */
export function isScreeningWorkpaperDump(md: string): boolean {
  const text = md.trim();
  if (!text) return false;
  if (/^#{1,3}\s+\d+\.\d+\s+\S/mu.test(text)) return false;
  const first = (text.match(/^#{1,3}\s+(.+)$/mu)?.[1] ?? "")
    .trim()
    .replace(/^\d+(?:\.\d+)*[.)．、]?\s*/u, "");
  if (WORKPAPER_TITLE_RE.test(first)) return true;
  return THEME_DUMP_RE.test(text) && !/(?:本章结论|初筛结论)/u.test(text);
}

function hasFloorHeading(md: string, id: string, title: string): boolean {
  if (extractMarkdownHeadingSlice(md, `${id} ${title}`).trim()) return true;
  if (extractMarkdownHeadingSlice(md, title).trim()) return true;
  const idRe = new RegExp(
    `^#{1,3}\\s+${id.replace(/\./g, "\\.")}(?:\\s|$)`,
    "mu",
  );
  return idRe.test(md);
}

function hasChapterHeading(md: string, spec: KnChapterFloor): boolean {
  if (extractNumberedMarkdownChapter(md, spec.chapter).trim()) return true;
  return Boolean(extractMarkdownHeadingSlice(md, spec.title).trim());
}

/** 备忘录切空或切到主题/补充稿时，仍给出 1.1 / 2.1 这种必有子节。 */
export function ensureScreeningChapterFloor(
  md: string,
  sectionId: string,
): string {
  const spec = SCREENING_KN_FLOORS[sectionId];
  if (!spec) return md.trim();
  let out = isScreeningWorkpaperDump(md) ? "" : md.trim();
  if (!out || !hasChapterHeading(out, spec)) {
    const head = `## ${spec.chapter}. ${spec.title}`;
    out = out ? `${head}\n\n${out}` : head;
  }
  for (const sub of spec.subsections) {
    if (hasFloorHeading(out, sub.id, sub.title)) continue;
    out += `\n\n### ${sub.id} ${sub.title}\n`;
  }
  return out.trim();
}

export function resolveKnWorkstream(input: {
  pipelineStage?: PipelineStage | null;
}): KnWorkstream {
  const stage = input.pipelineStage ?? null;
  if (
    stage &&
    (DILIGENCE_PIPELINE_STAGES as readonly string[]).includes(stage)
  ) {
    return "diligence";
  }
  return "screening";
}

/** 专章底稿整份进入；多章文件按编号或标题切。 */
export function sliceDeliverableForKn(
  raw: string,
  spec: KnSourceSpec,
): string {
  if (!raw.trim()) return "";
  if (spec.numberedChapter != null) {
    const numbered = extractNumberedMarkdownChapter(raw, spec.numberedChapter);
    if (numbered.trim()) return numbered;
    if (spec.headings?.length) {
      return extractMarkdownHeadingSlices(raw, spec.headings);
    }
    return "";
  }
  if (spec.headings?.length) {
    const cut = extractMarkdownHeadingSlices(raw, spec.headings);
    if (cut.trim()) return cut;
    return spec.fallbackWhole ? stripWorkpaperCover(raw) : "";
  }
  return spec.fallbackWhole || !spec.into ? raw.trim() : "";
}

const WORKPAPER_COVER_RE =
  /^(?:赛道确认|赛道|公开补充要点|公开信息补充|投资主题|项目简报|项目初筛备忘录)(?:[：:].*)?$/u;

/** 去掉底稿自己的 H1 /「赛道」「公开补充要点」，避免顶替报告子节标题。 */
export function stripWorkpaperCover(md: string): string {
  const lines = md.replace(/^\uFEFF/, "").trim().split(/\r?\n/u);
  let i = 0;
  while (i < lines.length) {
    const m = /^(#{1,3})\s+(.*)$/u.exec(lines[i] ?? "");
    if (!m) break;
    const title = (m[2] ?? "")
      .trim()
      .replace(/^\d+(?:\.\d+)*[.)．、]?\s*/u, "");
    if (WORKPAPER_COVER_RE.test(title) || m[1]!.length === 1) {
      i += 1;
      while (i < lines.length && !lines[i]!.trim()) i += 1;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n").trim();
}

function demoteWorkpaperHeadings(md: string): string {
  return md.replace(/^#{1,2}\s+/gmu, "#### ");
}

function alreadyHas(existing: string, incoming: string): boolean {
  const a = existing.replace(/\s+/gu, "");
  const b = incoming.replace(/\s+/gu, "");
  return Boolean(a && b && a.includes(b));
}

function headingLevel(line: string): number {
  return /^(#{1,3})\s+/u.exec(line)?.[1]?.length ?? 0;
}

/** 把底稿片段追加到已有 ### 1.1 / 2.1 下面，不另起文件标题。 */
export function appendUnderSubsection(
  doc: string,
  subsectionId: string,
  incoming: string,
): string {
  const body = demoteWorkpaperHeadings(stripWorkpaperCover(incoming)).trim();
  if (!body) return doc;
  const lines = doc.split(/\r?\n/u);
  const idRe = new RegExp(
    `^#{1,3}\\s+${subsectionId.replace(/\./gu, "\\.")}(?:\\s|$)`,
    "u",
  );
  let start = -1;
  let level = 3;
  for (let i = 0; i < lines.length; i += 1) {
    if (!idRe.test(lines[i] ?? "")) continue;
    start = i;
    level = headingLevel(lines[i] ?? "") || 3;
    break;
  }
  if (start < 0) {
    return `${doc.trim()}\n\n### ${subsectionId}\n\n${body}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const next = headingLevel(lines[i] ?? "");
    if (next && next <= level) {
      end = i;
      break;
    }
  }
  const existing = lines.slice(start + 1, end).join("\n").trim();
  if (alreadyHas(existing, body)) return doc;
  const merged = existing ? `${existing}\n\n${body}` : body;
  return [...lines.slice(0, start + 1), "", merged, "", ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/**
 * 筛选报告一章：备忘录骨架 + 底稿按子节填入。
 * 主题/公开补充稿不会整份变成该章标题。
 */
export function assembleScreeningChapterMarkdown(
  sectionId: string,
  files: Readonly<Partial<Record<string, string>>>,
): string {
  const specs = SCREENING_KN_SOURCES[sectionId] ?? [];
  const memoSpec = specs.find((s) => s.fileId === MEMO && !s.into);
  let memo = memoSpec
    ? sliceDeliverableForKn(files[MEMO] ?? "", memoSpec)
    : "";
  if (isScreeningWorkpaperDump(memo)) memo = "";
  let doc = ensureScreeningChapterFloor(memo, sectionId);
  const usedWhole = new Set<string>();
  for (const spec of specs) {
    if (spec.fileId === MEMO && !spec.into) continue;
    const raw = files[spec.fileId] ?? "";
    if (!raw.trim() || !spec.into) continue;
    let slice = "";
    if (spec.headings?.length) {
      slice = extractMarkdownHeadingSlices(raw, spec.headings);
    }
    if (!slice.trim() && spec.fallbackWhole && !usedWhole.has(spec.fileId)) {
      slice = stripWorkpaperCover(raw);
      if (slice.trim()) usedWhole.add(spec.fileId);
    }
    if (!slice.trim()) continue;
    doc = appendUnderSubsection(doc, spec.into, slice);
  }
  return doc.trim();
}
