/**
 * CapitalLens 知识网络：按工作流把底稿装配成七章报告。
 * 筛选看 screening-memo 对应章；尽调看尽调底稿，不把两份报告叠进同一章。
 * 表里的子节是必有内容，不是白名单——专章底稿整份进入，多出来的内容留在同一章。
 */
import {
  extractMarkdownHeadingSlices,
  extractNumberedMarkdownChapter,
} from "./kn-md-headings";
import type { PipelineStage } from "./pipeline-stage";

export type KnWorkstream = "screening" | "diligence";

export type KnSourceSpec = {
  readonly fileId: string;
  /** 多章报告/备忘录按编号切 */
  readonly numberedChapter?: number;
  /** 一份底稿喂多章时按标题切；切不到则该条为空，不整份灌进别章 */
  readonly headings?: readonly string[];
};

const MEMO = "screening-memo";
const REPORT = "investment-analysis-report";

function memoChapter(
  n: number,
  headings: readonly string[],
): KnSourceSpec {
  return { fileId: MEMO, numberedChapter: n, headings };
}

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
    { fileId: "brief" },
    { fileId: "theme" },
  ],
  "industry-competition": [memoChapter(2, ["行业与竞争"])],
  "business-technology": [memoChapter(3, ["业务与技术"])],
  "company-team": [memoChapter(4, ["公司与团队"])],
  "financial-diligence": [memoChapter(5, ["财务分析"])],
  "risk-return": [memoChapter(6, ["风险与回报"])],
  "diligence-gaps": [memoChapter(7, ["待解决问题"])],
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
    return extractMarkdownHeadingSlices(raw, spec.headings);
  }
  return raw.trim();
}
