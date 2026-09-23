/** 把写的时候的换行留住；已经收成一行的「1. … 2. …」也按题号拆开显示。 */
export function formatCollabLineBreaks(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  if (normalized.includes("\n")) return normalized;
  const parts = normalized
    .split(/(?<=\S)\s+(?=\d+[.、．]\s*\S)/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.join("\n") : normalized;
}

export function collabQuestionLines(text: string): string[] {
  return formatCollabLineBreaks(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 拖完后写回。本来带题号的，按新顺序重编号。 */
export function joinCollabQuestionLines(parts: string[]): string {
  const numbered =
    parts.length > 1 && parts.every((part) => /^\d+[.、．]\s+\S/u.test(part));
  if (!numbered) return parts.join("\n");
  return parts
    .map((part, index) => {
      const rest = part.replace(/^\d+[.、．]\s+/u, "");
      return `${index + 1}. ${rest}`;
    })
    .join("\n");
}
