/** 轻量行级 diff（LCS），用于知识网络审核页 */

export type LineDiffPart = {
  type: "equal" | "add" | "remove";
  value: string;
};

/**
 * 对两段纯文本做按行 diff。
 * 行数较大时退化为「整段删除 + 整段新增」，避免 O(n²) 卡顿。
 */
export function diffLines(oldText: string, newText: string): LineDiffPart[] {
  const a = (oldText ?? "").replace(/\r\n/g, "\n").split("\n");
  const b = (newText ?? "").replace(/\r\n/g, "\n").split("\n");

  if (a.length * b.length > 250_000) {
    const parts: LineDiffPart[] = [];
    if (oldText.trim()) parts.push({ type: "remove", value: oldText });
    if (newText.trim()) parts.push({ type: "add", value: newText });
    return parts.length ? parts : [{ type: "equal", value: "" }];
  }

  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? (dp[i + 1]![j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }

  const raw: LineDiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: "equal", value: a[i]! });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) {
      raw.push({ type: "remove", value: a[i]! });
      i += 1;
    } else {
      raw.push({ type: "add", value: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    raw.push({ type: "remove", value: a[i]! });
    i += 1;
  }
  while (j < m) {
    raw.push({ type: "add", value: b[j]! });
    j += 1;
  }

  // 合并相邻同类型
  const merged: LineDiffPart[] = [];
  for (const part of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === part.type) {
      last.value = `${last.value}\n${part.value}`;
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}

export function stripHtmlToText(html: string): string {
  return (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|details|summary|table|thead|tbody)>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&amp;/giu, "&")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

export function normalizeHtmlForCompare(html: string): string {
  return (html ?? "").replace(/\s+/gu, " ").trim();
}
