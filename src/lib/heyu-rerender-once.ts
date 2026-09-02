/** 临时候：仅合域项目可用「按现有分析重排版」。验证完删。 */
export const HEYU_RERENDER_ONCE_PROJECT_ID = "proj-b4e11bf7d24a";
export const HEYU_RERENDER_ONCE_NAME = "合域 AI 家族办公室投研平台";

export function isHeyuRerenderOnceProject(
  projectId: string,
  name?: string | null,
): boolean {
  if (projectId.trim() === HEYU_RERENDER_ONCE_PROJECT_ID) return true;
  return (name ?? "").trim() === HEYU_RERENDER_ONCE_NAME;
}
