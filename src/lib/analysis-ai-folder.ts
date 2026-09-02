import type { AnalysisKind } from "@/lib/analysis-kind";
import { AI_GENERATED_FOLDER } from "@/lib/project-api";
import { SKILL_PACKS } from "@/lib/skill-packs";

const PACK_BY_KIND: Record<
  AnalysisKind,
  (typeof SKILL_PACKS)[number]["id"]
> = {
  early: "startup",
  mature: "capitallens",
  acquire: "buy-to-build",
};

function packLabel(kind: AnalysisKind): string {
  const id = PACK_BY_KIND[kind];
  return SKILL_PACKS.find((p) => p.id === id)?.label ?? id;
}

/** 源文件里与当前形态对应的 AI 分析目录（物理路径） */
export function analysisAiFolderPhysical(kind: AnalysisKind): string {
  return `${AI_GENERATED_FOLDER}/${PACK_BY_KIND[kind]}`;
}

export function analysisAiFolderLabel(kind: AnalysisKind): string {
  return `源文件 › AI生成 › ${packLabel(kind)}`;
}

export function analysisAiFolderHref(
  projectId: string,
  kind: AnalysisKind,
): string {
  const folder = analysisAiFolderPhysical(kind);
  return `/app/projects/${encodeURIComponent(projectId)}/materials?folder=${encodeURIComponent(folder)}`;
}
