/**
 * 用资料包里已有分析重新渲知识网络研究章：不重写文件、不跑概览。
 * 有待审核草案时重排当前草案；没有时新建一份待审核草案。
 */
import type { AnalysisKind } from "./analysis-kind";
import { knSectionRendersFromFiles } from "./chapter-from-deliverables";
import { fullDraftSectionIds } from "./kn-catalog";

export function knSectionsToRerenderFromFiles(kind: AnalysisKind): string[] {
  return fullDraftSectionIds(kind).filter(
    (id) => id !== "project-overview" && knSectionRendersFromFiles(kind, id),
  );
}
