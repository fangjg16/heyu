/**
 * 对话点名的资料文件：跟知识网络目录同一套路径/skill，
 * 创业项目不要落到 capitallens 的 risk-matrix.md。
 */
import type { AnalysisKind } from "./analysis-kind";
import {
  deliverableById,
  deliverablesForKind,
  deliverableRelativePath,
  type DeliverableFile,
} from "./deliverable-catalog";

type AliasRule = { id: string; re: RegExp };

/** 越靠前越具体。创业「风险清单」必须先于泛尽调。 */
const EARLY_ALIASES: AliasRule[] = [
  {
    id: "risk-analysis",
    re: /风险清单|风险分析|风险评估|风险矩阵|关键风险|risk[-\s]?analysis|risk[-\s]?list|what could go wrong|what are the risks/iu,
  },
  {
    id: "competitor-landscape",
    re: /竞争格局|创业竞品|早期竞品|竞品分析|竞品|市场对标|经营对标|对标/iu,
  },
  {
    id: "market-analysis",
    re: /市场分析|市场规模|总市场|可服务市场|可获得份额/iu,
  },
  { id: "industry-trends", re: /行业趋势/iu },
  { id: "target-audience", re: /目标客户|客群/iu },
  { id: "positioning", re: /差异化定位|创业定位|早期定位|定位/iu },
  { id: "go-to-market", re: /市场进入|获客|go[-\s]?to[-\s]?market|\bgtm\b/iu },
  { id: "lean-canvas", re: /lean\s*canvas|精益画布/iu },
  { id: "business-model", re: /商业模式/iu },
  { id: "value-proposition", re: /价值主张/iu },
  { id: "mvp-definition", re: /\bmvp\b|最小可行/iu },
  { id: "user-journey", re: /用户旅程/iu },
  { id: "feature-prioritization", re: /功能规划|功能优先级/iu },
  { id: "revenue-model", re: /收入模式|怎么赚钱/iu },
  { id: "cost-structure", re: /成本结构/iu },
  { id: "projections", re: /三年预测|财务预测/iu },
  { id: "assumptions-tracker", re: /关键假设/iu },
  { id: "validation-playbook", re: /验证手册/iu },
  { id: "experiment-design", re: /实验设计/iu },
  { id: "kill-criteria", re: /停止标准|该停/iu },
  { id: "scorecard", re: /综合总评|评分卡/iu },
  { id: "readme", re: /执行摘要/iu },
  { id: "action-plan-30-days", re: /下一步行动|30\s*天/iu },
  { id: "research-gate", re: /研究闸门/iu },
  { id: "confidence-dashboard", re: /结论可靠度/iu },
];

const ACQUIRE_ALIASES: AliasRule[] = [
  {
    id: "acquisition-risk-matrix",
    re: /风险清单|风险分析|风险评估|风险矩阵|收购风险/iu,
  },
];

const EARLY_INTENT_FILE: Record<string, string> = {
  risk_matrix: "risk-analysis",
  industry_due_diligence: "competitor-landscape",
  startup_competitors: "competitor-landscape",
  classify_investment_theme: "market-analysis",
  business_due_diligence: "business-model",
  financial_due_diligence: "projections",
  returns_analysis: "projections",
  sensitivity_analysis: "projections",
  startup_positioning: "positioning",
  dd_checklist: "validation-playbook",
  gap_tracking: "assumptions-tracker",
  value_creation_plan: "action-plan-30-days",
  compliance_check: "research-gate",
};

const ACQUIRE_INTENT_FILE: Record<string, string> = {
  risk_matrix: "acquisition-risk-matrix",
};

function aliasesForKind(kind: AnalysisKind): AliasRule[] {
  if (kind === "early") return EARLY_ALIASES;
  if (kind === "acquire") return ACQUIRE_ALIASES;
  return [];
}

function intentFileMap(kind: AnalysisKind): Record<string, string> {
  if (kind === "early") return EARLY_INTENT_FILE;
  if (kind === "acquire") return ACQUIRE_INTENT_FILE;
  return {};
}

export function deliverableByAnyId(id: string): DeliverableFile | undefined {
  const key = (id ?? "").trim();
  if (!key) return undefined;
  for (const kind of ["early", "mature", "acquire"] as const) {
    const file = deliverableById(kind, key);
    if (file) return file;
  }
  return undefined;
}

/** 对话原文是否点到目录别名或标题（只做召回，不代表就要生成）。 */
export function hitsDeliverableRecall(
  kind: AnalysisKind | null | undefined,
  message: string,
): boolean {
  return matchChatDeliverable(kind, message) !== null;
}

/** 对话原文点到哪一份目录文件。 */
export function matchChatDeliverable(
  kind: AnalysisKind | null | undefined,
  message: string,
): DeliverableFile | null {
  if (!kind) return null;
  const text = (message ?? "").trim();
  if (!text) return null;
  for (const rule of aliasesForKind(kind)) {
    if (rule.re.test(text)) {
      return deliverableById(kind, rule.id) ?? null;
    }
  }
  for (const file of deliverablesForKind(kind)) {
    const title = file.title.trim();
    if (title && text.includes(title)) return file;
  }
  return null;
}

export function deliverableForChatIntent(
  intent: string,
  kind?: AnalysisKind | null,
): DeliverableFile | null {
  const key = (intent ?? "").trim();
  if (!key) return null;
  const byId = deliverableByAnyId(key);
  if (byId) return byId;
  if (!kind) return null;
  const mapped = intentFileMap(kind)[key];
  if (mapped) return deliverableById(kind, mapped) ?? null;
  return null;
}

/** 点名了目录文件就写入 file.id，落库才不会全挤进 brief.md / risk-matrix.md */
export function persistIntentForChat(
  kind: AnalysisKind | null | undefined,
  message: string,
  chatMode: string,
): string {
  return matchChatDeliverable(kind, message)?.id ?? chatMode;
}

export function skillIntentForDeliverable(file: DeliverableFile): string {
  return file.skill.replace(/-/gu, "_");
}

/** Hermes 主 skill：创业点名目录文件时用该文件的 skill，不要用投研 risk-matrix。 */
export function hermesSkillForChatIntent(
  intent: string,
  kind?: AnalysisKind | null,
): string {
  const file = deliverableForChatIntent(intent, kind);
  if (file) return file.skill;
  const key = (intent ?? "").trim();
  if (key === "standard") return "project-intake";
  if (key === "skill_verify") return "jfo-skill-verify";
  if (key === "knowledge_network") return "opportunistic-investments-hermes";
  return key.replace(/_/gu, "-");
}

export function aiGeneratedPathFromDeliverable(file: DeliverableFile): {
  pack: string;
  folder: string;
  filename: string;
  relativePath: string;
} {
  return {
    pack: file.pack,
    folder: file.folder,
    filename: file.filename,
    relativePath: deliverableRelativePath(file),
  };
}

export function chatDeliverablePath(
  intent: string,
  kind?: AnalysisKind | null,
): {
  pack: string;
  folder: string;
  filename: string;
  relativePath: string;
} | null {
  const file = deliverableForChatIntent(intent, kind);
  return file ? aiGeneratedPathFromDeliverable(file) : null;
}

export function chatDeliverableInstructionLines(file: DeliverableFile): string[] {
  const path = `${deliverableRelativePath(file)}/${file.filename}`;
  const lines = [
    "",
    "【本次要写的那份资料】",
    `用户要的是「${file.title}」，不是别的章节。`,
    `写一份完整 Markdown，从 # 或 ## 标题起写正文。平台会把本条回复写入资料包：${path}。`,
    "禁止写「已写入」「文件已保存」或只交回执；本条回复本身就是那份文件。",
    "不要在正文末尾交代 skill 名称或保存路径，平台会自行告知用户。",
  ];
  if (file.id === "risk-analysis") {
    lines.push(
      "这是创业项目的风险清单：关键风险、假设失效路径、缓释与验证；不要写成投资人风险矩阵或 IRR 情景。",
    );
  }
  lines.push("不要写成别的项目类型的同名文档。");
  return lines;
}

export function chatDeliverableRootHint(file: DeliverableFile): string {
  return `${deliverableRelativePath(file)}/${file.filename}`;
}
