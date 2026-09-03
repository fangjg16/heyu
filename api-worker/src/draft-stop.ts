/** 停止生成时：已有正文的章留下，空的标失败。不放弃整份草案。 */
export function stoppedDraftItemStatus(item: {
  status: string;
  html?: string | null;
}): { status: "ok" | "failed"; error: string | null } | null {
  if (item.status !== "pending" && item.status !== "revising") return null;
  if (item.html?.trim()) return { status: "ok", error: null };
  return { status: "failed", error: "已停止生成" };
}
