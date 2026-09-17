/**
 * 用资料包里已有分析重新渲知识网络章节：不重写文件、不跑大模型。
 * 有对应资料包文件的章（含项目概览）都会按文件重排。
 */
import type { AnalysisKind } from "./analysis-kind";
import { knSectionRendersFromFiles } from "./chapter-from-deliverables";
import { fullDraftSectionIds } from "./kn-catalog";

export function knSectionsToRerenderFromFiles(kind: AnalysisKind): string[] {
  return fullDraftSectionIds(kind).filter((id) =>
    knSectionRendersFromFiles(kind, id),
  );
}
