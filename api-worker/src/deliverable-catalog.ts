/**
 * 三套形态「先写资料包文件、再填知识网络」的文件目录。
 * 路径：AI生成/{pack}/{folder}/{filename}，同一路径再生成是新版本。
 */
import type { AnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";
import {
  deliverableDraftId,
  fullDraftSectionIds,
} from "./kn-catalog";
import { AI_GENERATED_ROOT } from "./ai-generated-path";
import type { SkillPackId } from "./skill-packs";

export type DeliverableFile = {
  readonly id: string;
  readonly pack: Exclude<SkillPackId, "platform">;
  readonly folder: string;
  readonly filename: string;
  readonly title: string;
  readonly skill: string;
  readonly knSectionIds: readonly string[];
  readonly phase: number;
};

function f(
  id: string,
  pack: Exclude<SkillPackId, "platform">,
  folder: string,
  filename: string,
  title: string,
  skill: string,
  knSectionIds: readonly string[],
  phase: number,
): DeliverableFile {
  return { id, pack, folder, filename, title, skill, knSectionIds, phase };
}

const EARLY: readonly DeliverableFile[] = [
  f("market-analysis", "startup", "01-discovery", "market-analysis.md", "市场分析", "startup-design", ["market-analysis"], 1),
  f("competitor-landscape", "startup", "01-discovery", "competitor-landscape.md", "竞争格局", "startup-competitors", ["competitor-landscape"], 1),
  f("industry-trends", "startup", "01-discovery", "industry-trends.md", "行业趋势", "startup-design", ["industry-trends"], 1),
  f("target-audience", "startup", "01-discovery", "target-audience.md", "目标客户", "startup-design", ["target-audience"], 1),
  f("confidence-dashboard", "startup", "01-discovery", "confidence-dashboard.md", "结论可靠度", "startup-design", ["research-gate"], 2),
  f("research-gate", "startup", "01-discovery", "research-gate.md", "研究闸门", "startup-design", ["research-gate"], 2),
  f("lean-canvas", "startup", "02-strategy", "lean-canvas.md", "Lean Canvas", "startup-design", ["lean-business-model"], 3),
  f("business-model", "startup", "02-strategy", "business-model.md", "商业模式", "startup-design", ["lean-business-model"], 3),
  f("value-proposition", "startup", "02-strategy", "value-proposition.md", "价值主张", "startup-design", ["value-proposition"], 3),
  f("positioning", "startup", "02-strategy", "positioning.md", "差异化定位", "startup-positioning", ["positioning"], 3),
  f("go-to-market", "startup", "02-strategy", "go-to-market.md", "市场进入", "startup-pitch", ["go-to-market"], 3),
  f("mvp-definition", "startup", "04-product", "mvp-definition.md", "MVP产品", "startup-design", ["mvp-definition"], 4),
  f("user-journey", "startup", "04-product", "user-journey.md", "用户旅程", "startup-design", ["user-journey"], 4),
  f("feature-prioritization", "startup", "04-product", "feature-prioritization.md", "功能规划", "startup-design", ["feature-prioritization"], 4),
  f("revenue-model", "startup", "05-financial", "revenue-model.md", "收入模式", "startup-design", ["revenue-model"], 5),
  f("cost-structure", "startup", "05-financial", "cost-structure.md", "成本结构", "startup-design", ["cost-structure"], 5),
  f("projections", "startup", "05-financial", "projections.md", "三年预测", "startup-design", ["projections"], 5),
  f("risk-analysis", "startup", "06-validation", "risk-analysis.md", "风险清单", "startup-design", ["risk-analysis"], 6),
  f("assumptions-tracker", "startup", "06-validation", "assumptions-tracker.md", "关键假设", "startup-design", ["assumptions-tracker"], 6),
  f("validation-playbook", "startup", "06-validation", "validation-playbook.md", "验证手册", "startup-design", ["validation-playbook"], 6),
  f("experiment-design", "startup", "06-validation", "experiment-design.md", "实验设计", "startup-design", ["validation-playbook"], 6),
  f("kill-criteria", "startup", "06-validation", "kill-criteria.md", "停止标准", "startup-design", ["validation-playbook"], 6),
  f("scorecard", "startup", "00-overview", "scorecard.md", "综合总评", "startup-design", ["project-scorecard"], 7),
  f("readme", "startup", "00-overview", "README.md", "执行摘要", "startup-design", ["exec-summary"], 7),
  f("action-plan-30-days", "startup", "07-next", "action-plan-30-days.md", "下一步行动", "startup-design", ["action-plan-30d"], 7),
];

const MATURE: readonly DeliverableFile[] = [
  f("brief", "capitallens", "00-intake", "brief.md", "项目简报", "project-intake", ["project-summary"], 1),
  f("theme", "capitallens", "00-intake", "theme.md", "投资主题", "classify-investment-theme", ["project-summary"], 1),
  f("industry-due-diligence", "capitallens", "01-industry", "industry-due-diligence.md", "行业尽调", "industry-due-diligence", ["industry-competition"], 2),
  f("business-due-diligence", "capitallens", "02-business", "business-due-diligence.md", "商业尽调", "business-due-diligence", ["business-technology"], 3),
  f("background-check", "capitallens", "04-company", "background-check.md", "背景调查", "background-check", ["company-team"], 4),
  f("compliance-check", "capitallens", "04-company", "compliance-check.md", "合规检查", "compliance-check", ["company-team"], 4),
  f("financial-due-diligence", "capitallens", "03-financials", "financial-due-diligence.md", "财务尽调", "financial-due-diligence", ["financial-diligence"], 5),
  f("returns", "capitallens", "05-decision", "returns.md", "回报测算", "returns-analysis", ["investment-structure-returns"], 6),
  f("risk-matrix", "capitallens", "05-decision", "risk-matrix.md", "风险矩阵", "risk-matrix", ["investment-risks"], 7),
  f("gaps", "capitallens", "05-decision", "gaps.md", "信息缺口", "gap-tracking", ["diligence-gaps"], 8),
  f("dd-checklist", "capitallens", "05-decision", "dd-checklist.md", "尽调清单", "dd-checklist", ["diligence-gaps"], 8),
  f("investment-analysis-report", "capitallens", "05-decision", "investment-analysis-report.md", "投资分析", "ic-memo", ["investment-conclusion"], 9),
  f("value-creation-plan", "capitallens", "05-decision", "value-creation-plan.md", "增值方案", "value-creation-plan", ["investment-conclusion"], 9),
];

const ACQUIRE: readonly DeliverableFile[] = [
  f("intake", "buy-to-build", "00-intake", "intake.md", "收购立项", "acquisition-intake", ["decision-object"], 1),
  f("screening", "buy-to-build", "01-screening", "screening.md", "标的筛选", "target-screening", ["decision-object"], 1),
  f("acquisition-due-diligence", "buy-to-build", "02-diligence", "acquisition-due-diligence.md", "收购尽调", "acquisition-due-diligence", ["business-worth-buying"], 2),
  f("acquisition-economics", "buy-to-build", "03-economics", "acquisition-economics.md", "收购经济性", "acquisition-economics", ["price-financing-downside"], 3),
  f("buyer-fit", "buy-to-build", "04-fit", "buyer-fit.md", "买方适配", "buyer-fit-transition", ["buyer-fit-takeover"], 4),
  f("acquisition-risk-matrix", "buy-to-build", "05-risk", "risk-matrix.md", "收购风险", "risk-matrix", ["acquisition-risk-register"], 5),
  f("acquisition-gaps", "buy-to-build", "05-risk", "gaps.md", "未决事项", "gap-tracking", ["open-items-exceptions"], 6),
  f("claim-audit", "buy-to-build", "05-risk", "claim-audit.md", "声明审计", "dd-claim-audit", ["counterarguments-invalidation"], 6),
  f("acquisition-decision", "buy-to-build", "06-decision", "acquisition-decision.md", "收购闸门", "acquisition-gate", ["exec-verdict", "recommendation-conditions"], 7),
];

const BY_KIND: Record<AnalysisKind, readonly DeliverableFile[]> = {
  early: EARLY,
  mature: MATURE,
  acquire: ACQUIRE,
};

export function deliverablesForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): readonly DeliverableFile[] {
  return BY_KIND[kind] ?? MATURE;
}

export function deliverableById(
  kind: AnalysisKind,
  fileId: string,
): DeliverableFile | undefined {
  return deliverablesForKind(kind).find((d) => d.id === fileId);
}

export function deliverableRelativePath(file: DeliverableFile): string {
  return `${AI_GENERATED_ROOT}/${file.pack}/${file.folder}`;
}

export function deliverablesForKnSection(
  kind: AnalysisKind,
  sectionId: string,
): DeliverableFile[] {
  return deliverablesForKind(kind).filter((d) =>
    d.knSectionIds.includes(sectionId),
  );
}

export function deliverableFilenamesForKnSection(
  kind: AnalysisKind,
  sectionId: string,
): string[] {
  return deliverablesForKnSection(kind, sectionId).map((d) => d.filename);
}

/** 更新全部：文件条目在前，研究章 + 概览在后。单章：该章文件 + 该章。 */
export function draftGenerateItemIds(
  kind: AnalysisKind,
  scope: "full" | "section",
  sectionId?: string | null,
): string[] {
  if (scope === "section" && sectionId) {
    const files = deliverablesForKnSection(kind, sectionId).map((d) =>
      deliverableDraftId(d.id),
    );
    return [...files, sectionId];
  }
  const files = deliverablesForKind(kind).map((d) => deliverableDraftId(d.id));
  return [...files, ...fullDraftSectionIds(kind)];
}

export function deliverableDraftIdsForKnSections(
  kind: AnalysisKind,
  sectionIds: readonly string[],
): string[] {
  const wanted = new Set(sectionIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of deliverablesForKind(kind)) {
    if (!d.knSectionIds.some((id) => wanted.has(id))) continue;
    const itemId = deliverableDraftId(d.id);
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    out.push(itemId);
  }
  return out;
}

export function earlierDeliverables(
  kind: AnalysisKind,
  file: DeliverableFile,
): DeliverableFile[] {
  const all = deliverablesForKind(kind);
  const idx = all.findIndex((d) => d.id === file.id);
  return idx <= 0 ? [] : [...all.slice(0, idx)];
}

export function unpublishedGenerateItemIds(
  kind: AnalysisKind,
  unpublishedKnIds: readonly string[],
): string[] {
  const kn = unpublishedKnIds.filter((id) => !id.startsWith("dlv:"));
  return [...deliverableDraftIdsForKnSections(kind, kn), ...kn];
}

export function orderDeliverableDraftIds(
  kind: AnalysisKind,
  ids: readonly string[],
): string[] {
  const order = new Map(
    deliverablesForKind(kind).map((d, i) => [deliverableDraftId(d.id), i]),
  );
  return [...ids].sort(
    (a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999),
  );
}

export const FILE_DRAFT_HTML_PREFIX = "file:";

export function deliverableDraftHtmlMarker(file: DeliverableFile): string {
  return `${FILE_DRAFT_HTML_PREFIX}${deliverableRelativePath(file)}/${file.filename}`;
}

export function isDeliverableDraftHtml(html: string | null | undefined): boolean {
  return (html ?? "").trim().startsWith(FILE_DRAFT_HTML_PREFIX);
}
