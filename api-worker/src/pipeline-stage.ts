/** CapitalLens / mature 投资流水线。early、acquire 不使用。 */

export const PIPELINE_STAGES = [
  "inbound",
  "deal-screening",
  "due-diligence",
  "ic-review",
  "invested",
  "passed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const IN_PROGRESS_PIPELINE_STAGES = [
  "inbound",
  "deal-screening",
  "due-diligence",
  "ic-review",
] as const;

export const COMPLETED_PIPELINE_STAGES = ["invested", "passed"] as const;

export const PIPELINE_STAGE_LABELS: Readonly<Record<PipelineStage, string>> = {
  inbound: "待筛选",
  "deal-screening": "筛选",
  "due-diligence": "尽调",
  "ic-review": "投委",
  invested: "已投",
  passed: "不投",
};

type TopPhase = "进行中" | "已完成" | "已归档" | "已暂停";
type AnalysisKind = "early" | "mature" | "acquire";

export function parsePipelineStage(raw: unknown): PipelineStage | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((PIPELINE_STAGES as readonly string[]).includes(v)) {
    return v as PipelineStage;
  }
  if (v === "screening") return "deal-screening";
  if (v === "dd" || v === "diligence") return "due-diligence";
  if (v === "ic") return "ic-review";
  return null;
}

export function pipelineStageLabel(
  stage: PipelineStage | null | undefined,
): string {
  if (!stage) return "";
  return PIPELINE_STAGE_LABELS[stage];
}

export function isInProgressPipelineStage(
  stage: PipelineStage | null | undefined,
): boolean {
  return (
    !!stage &&
    (IN_PROGRESS_PIPELINE_STAGES as readonly string[]).includes(stage)
  );
}

export function isCompletedPipelineStage(
  stage: PipelineStage | null | undefined,
): boolean {
  return (
    !!stage &&
    (COMPLETED_PIPELINE_STAGES as readonly string[]).includes(stage)
  );
}

export function defaultPipelineStageForKind(
  kind: AnalysisKind | null | undefined,
): PipelineStage | null {
  return kind === "mature" ? "inbound" : null;
}

/** 顶栏短操作：人工推进 / 结束。inbound→筛选是自动的，这里不出。 */
export function pipelineHeaderActions(
  phase: TopPhase,
  stage: PipelineStage | null,
): {
  id: "to-dd" | "to-ic" | "pass" | "invest";
  label: string;
  confirmTitle: string;
  confirmBody: string;
  pipelineStage: PipelineStage;
  phase: TopPhase;
}[] {
  if (phase !== "进行中") return [];
  const actions: ReturnType<typeof pipelineHeaderActions> = [];
  if (stage === "deal-screening") {
    actions.push({
      id: "to-dd",
      label: "推进到尽调",
      confirmTitle: "推进到尽调？",
      confirmBody: "确认后项目进入尽调。之后仍可标记不投。",
      pipelineStage: "due-diligence",
      phase: "进行中",
    });
  }
  if (stage === "due-diligence") {
    actions.push({
      id: "to-ic",
      label: "推进到投委",
      confirmTitle: "推进到投委？",
      confirmBody: "确认后项目进入投委审核。之后可标记已投或不投。",
      pipelineStage: "ic-review",
      phase: "进行中",
    });
  }
  if (stage === "ic-review") {
    actions.push({
      id: "invest",
      label: "标记已投",
      confirmTitle: "标记为已投？",
      confirmBody: "确认后项目记为已投，并归入已完成。",
      pipelineStage: "invested",
      phase: "已完成",
    });
  }
  if (isInProgressPipelineStage(stage) || stage == null) {
    actions.push({
      id: "pass",
      label: "标记不投",
      confirmTitle: "标记为不投？",
      confirmBody: "确认后项目记为不投，并归入已完成。任意研究步骤都可以这样结束。",
      pipelineStage: "passed",
      phase: "已完成",
    });
  }
  return actions;
}

export type PipelineHeaderAction = ReturnType<typeof pipelineHeaderActions>[number];

export function pipelineStageOptionsForEdit(
  phase: TopPhase,
): { value: PipelineStage; label: string }[] {
  const completed = COMPLETED_PIPELINE_STAGES.map((value) => ({
    value,
    label: PIPELINE_STAGE_LABELS[value],
  }));
  if (phase === "已完成") return completed;
  const inProgress = IN_PROGRESS_PIPELINE_STAGES.map((value) => ({
    value,
    label: PIPELINE_STAGE_LABELS[value],
  }));
  return [...inProgress, ...completed];
}

export function resolvePipelineForSave(input: {
  analysisKind: AnalysisKind | null;
  phase: TopPhase;
  current: PipelineStage | null;
  /** undefined = 请求未带该字段 */
  requested?: PipelineStage | null;
  allowInvestedOverride?: boolean;
}): { phase: TopPhase; pipelineStage: PipelineStage | null } {
  if (input.analysisKind !== "mature") {
    return { phase: input.phase, pipelineStage: null };
  }

  let stage: PipelineStage | null;
  if (input.requested === undefined) {
    stage = input.current;
    if (isCompletedPipelineStage(stage) && input.phase === "进行中") {
      stage = "ic-review";
    }
    if (stage == null) {
      if (input.phase === "已完成") {
        throw new Error("已完成须选择已投或不投");
      }
      stage = "inbound";
    }
  } else if (input.requested == null) {
    throw new Error("投资项目需要投资阶段");
  } else {
    stage = input.requested;
  }

  if (stage === "invested") {
    const fromIc =
      input.current === "ic-review" || input.current === "invested";
    if (!input.allowInvestedOverride && !fromIc) {
      throw new Error("标记已投须先到投委阶段");
    }
    return { phase: "已完成", pipelineStage: "invested" };
  }
  if (stage === "passed") {
    return { phase: "已完成", pipelineStage: "passed" };
  }

  if (input.phase === "已完成") {
    return { phase: "进行中", pipelineStage: stage };
  }
  if (input.phase === "已暂停" || input.phase === "已归档") {
    return { phase: input.phase, pipelineStage: stage };
  }
  return { phase: "进行中", pipelineStage: stage };
}
