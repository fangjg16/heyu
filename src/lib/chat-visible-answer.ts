import { stripAssistantThinkTags } from "./chat-think-tags";

/** 生成结束但没有任何可展示正文时给用户看的话，轻问和深度任务都用这一句。 */
export const CHAT_EMPTY_ANSWER_RETRY = "这次没有生成出来，请再问一次。";

export function visibleAssistantAnswer(parts: {
  doneAnswer?: string | null;
  streamed?: string | null;
}): string {
  const done = (parts.doneAnswer ?? "").trim();
  const streamed = (parts.streamed ?? "").trim();
  const raw = done || streamed;
  const visible = stripAssistantThinkTags(raw, false).trim();
  return visible || CHAT_EMPTY_ANSWER_RETRY;
}
