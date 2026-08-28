/** 沿用未发布草案时：失败章要重试；已成功待审核的章保留。 */
export function draftReuseShouldRetryFailed(
  runStatus: string,
  items: { status: string }[],
): boolean {
  if (runStatus === "generating" || runStatus === "failed") return true;
  if (runStatus !== "ready") return false;
  return items.some((i) => i.status === "failed");
}
