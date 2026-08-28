/** 沿用未发布草案时：失败章要重试；已成功待审核的章保留。 */
export function draftReuseShouldRetryFailed(
  runStatus: string,
  items: { status: string }[],
): boolean {
  if (runStatus === "generating" || runStatus === "failed") return true;
  if (runStatus !== "ready") return false;
  return items.some((i) => i.status === "failed");
}

export type DraftRegenMode = "unpublished" | "all-drafts";

function normHtml(html: string | null | undefined): string {
  return (html ?? "").replace(/\s+/gu, " ").trim();
}

/**
 * 还没上正式版、或草案与正式版不一致的研究章。
 * 已发布且草案仍等于正式版的章不在此列。
 */
export function unpublishedDraftSectionIds(
  researchIds: string[],
  items: { sectionId: string; status: string; html?: string | null }[],
  liveHtmlBySection: Map<string, string>,
): string[] {
  const byId = new Map(items.map((i) => [i.sectionId, i]));
  const out: string[] = [];
  for (const id of researchIds) {
    const item = byId.get(id);
    const live = normHtml(liveHtmlBySection.get(id));
    const draft = normHtml(item?.html);
    if (!live) {
      out.push(id);
      continue;
    }
    if (!item || item.status === "failed" || item.status === "pending") {
      out.push(id);
      continue;
    }
    if (draft !== live) out.push(id);
  }
  return out;
}
