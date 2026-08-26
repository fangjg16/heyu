/** 模型偶发把思维链标签写进正文（含未关标签、只剩闭合标签） */

const THINK_BLOCK_RE = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
const THINK_OPEN_RE = /<think\b[^>]*>/i;
const THINK_CLOSE_RE = /<\/think>/gi;

export function stripAssistantThinkTags(
  content: string,
  isStreaming = false,
): string {
  let s = content.replace(THINK_BLOCK_RE, "");
  s = s.replace(THINK_CLOSE_RE, "");
  const openIndex = s.search(THINK_OPEN_RE);
  if (openIndex >= 0) {
    if (isStreaming) {
      s = s.slice(0, openIndex);
    } else {
      s = s.replace(/<think\b[^>]*>[\s\S]*$/gi, "");
    }
  }
  return s.replace(/^\s+/u, "");
}
