/** 知识网络待审通知：点进审核页不等于办完，草案还在才算待办。 */

export function knDraftRunIdFromHref(href: string | null | undefined): string | null {
  const raw = String(href ?? "").trim();
  if (!raw) return null;
  try {
    const path = raw.startsWith("http") ? new URL(raw).pathname : raw;
    const m = path.match(/\/knowledge\/review\/([^/?#]+)/);
    const id = m?.[1] ? decodeURIComponent(m[1]) : "";
    return id.trim() || null;
  } catch {
    return null;
  }
}

export function isOpenKnDraftRunStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  return s === "generating" || s === "ready" || s === "failed";
}
