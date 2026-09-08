import type { NamedParseSummary } from "./chat-data";

const SUMMARY_CHAR_CAP = 900;
const KNOWLEDGE_CHAR_CAP = 28_000;

export function clipProjectSummaryText(text: string, cap = SUMMARY_CHAR_CAP): string {
  const t = text.trim();
  if (t.length <= cap) return t;
  return `${t.slice(0, cap).trim()}…`;
}

/** 把上传时已解析的摘要编成一直在场的项目知识，而不是本轮检索步骤。 */
export function formatProjectKnowledgeState(
  summaries: NamedParseSummary[],
  dbProjectSummary = "",
): string {
  const parts: string[] = [];
  const register = dbProjectSummary.trim();
  if (register) parts.push(register.replace(/\n+$/u, ""));

  let used = parts.join("\n").length;
  const fileBlocks: string[] = [];
  for (const s of summaries) {
    const points =
      s.keyPoints.length > 0
        ? `\n要点：\n${s.keyPoints.slice(0, 6).map((p) => `- ${p}`).join("\n")}`
        : "";
    const scopeHint = s.scope === "session" ? "（本对话附件）" : "";
    const block = `文件：${s.filename}${scopeHint}\n${clipProjectSummaryText(s.summary)}${points}`;
    if (used + block.length + 8 > KNOWLEDGE_CHAR_CAP) break;
    fileBlocks.push(block);
    used += block.length + 8;
  }

  if (fileBlocks.length === 0 && !register) return "";
  if (fileBlocks.length > 0) {
    parts.push(fileBlocks.join("\n\n---\n\n"));
  }
  return parts.filter(Boolean).join("\n\n");
}
