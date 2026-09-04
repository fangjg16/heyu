import type { AnalysisKind } from "@/lib/analysis-kind";
import {
  AI_GENERATED_FOLDER,
  type ProjectFileRecord,
} from "@/lib/project-api";
import { filesUnderFolder, isHiddenKeep } from "@/lib/project-file-tree";
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

/** 空占位稿大约几十字节；大于此值才算有可排版的分析稿。 */
const MIN_ANALYSIS_DELIVERABLE_BYTES = 80;

/** 当前形态的 AI 分析目录里是否已有可用来「仅重新排版」的稿件 */
export function hasAnalysisDeliverableFiles(
  files: ProjectFileRecord[],
  kind: AnalysisKind,
): boolean {
  const folder = analysisAiFolderPhysical(kind);
  return filesUnderFolder(files, folder).some((file) => {
    if (isHiddenKeep(file)) return false;
    const size = file.sizeBytes ?? 0;
    if (size > 0) return size > MIN_ANALYSIS_DELIVERABLE_BYTES;
    return Boolean(file.filename?.trim());
  });
}

/** 有待审核草案，或已有分析稿时，确认框才提供「仅重新排版」 */
export function showAllChaptersRerenderAction(input: {
  hasDraft: boolean;
  hasAnalysis: boolean;
}): boolean {
  return input.hasDraft || input.hasAnalysis;
}

/** 无草案、无分析稿、尚未访谈时，创业项目确认框提供「开始访谈」 */
export function showAllChaptersInterviewAction(input: {
  analysisKind: AnalysisKind;
  hasDraft: boolean;
  hasAnalysis: boolean;
  hasInterview: boolean;
  canStart: boolean;
}): boolean {
  return (
    input.analysisKind === "early" &&
    input.canStart &&
    !input.hasDraft &&
    !input.hasAnalysis &&
    !input.hasInterview
  );
}
