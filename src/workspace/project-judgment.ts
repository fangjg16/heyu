import {
  isInProgressPipelineStage,
  parsePipelineStage,
  pipelineStageLabel,
  type PipelineStage,
} from "@/workspace/pipeline-stage";
import { normalizeProjectPhase, type ProjectPhase } from "@/workspace/projects";

/** 与总览/原型一致的判断胶囊 */
export function judgmentFromPhase(phase: ProjectPhase | string | undefined): {
  label: string;
  bg: string;
  fg: string;
} {
  const safe = normalizeProjectPhase(phase);
  if (safe === "已暂停") {
    return { label: "已暂停", bg: "rgba(78,66,57,0.08)", fg: "#59625F" };
  }
  if (safe === "已完成") {
    return {
      label: "已完成",
      bg: "rgba(94,155,117,0.16)",
      fg: "#3F6F63",
    };
  }
  if (safe === "已归档") {
    return { label: "已归档", bg: "rgba(78,66,57,0.08)", fg: "#59625F" };
  }
  return {
    label: "进行中",
    bg: "#FBF1E2",
    fg: "#B07d1f",
  };
}

const PIPELINE_TONES: Record<PipelineStage, { bg: string; fg: string }> = {
  inbound: { bg: "#FBF1E2", fg: "#B07d1f" },
  "deal-screening": { bg: "rgba(213,154,47,0.18)", fg: "#8A5A12" },
  "due-diligence": { bg: "rgba(94,155,117,0.16)", fg: "#3F6F63" },
  "ic-review": { bg: "rgba(160,99,88,0.16)", fg: "#A06358" },
  invested: { bg: "rgba(94,155,117,0.16)", fg: "#3F6F63" },
  passed: { bg: "rgba(78,66,57,0.08)", fg: "#59625F" },
};

/** 顶栏主胶囊：mature 显示细分中文；暂停/归档仍显示顶层，旁注冻结阶段 */
export function judgmentFromPipeline(
  phase: ProjectPhase | string | undefined,
  analysisKind?: string | null,
  pipelineStage?: PipelineStage | string | null,
): {
  label: string;
  bg: string;
  fg: string;
  frozenNote?: string;
} {
  const safe = normalizeProjectPhase(phase);
  const base = judgmentFromPhase(safe);
  if (analysisKind !== "mature") return base;

  const stage = parsePipelineStage(pipelineStage);
  if (safe === "已暂停" || safe === "已归档") {
    return {
      ...base,
      frozenNote: stage ? pipelineStageLabel(stage) : undefined,
    };
  }
  if (safe === "已完成") {
    if (stage === "invested" || stage === "passed") {
      return { label: pipelineStageLabel(stage), ...PIPELINE_TONES[stage] };
    }
    return base;
  }
  if (stage && isInProgressPipelineStage(stage)) {
    return { label: pipelineStageLabel(stage), ...PIPELINE_TONES[stage] };
  }
  return { label: "待筛选", ...PIPELINE_TONES.inbound };
}
