import { CHAT_QUICK_PROMPTS } from "@/lib/chat-quick-prompts";

const FILE_ONLY = /^已发送\s*\d+\s*个文件/u;

const WRAPPERS: RegExp[] = [
  /^(请你?再?(帮我|帮忙)?|麻烦你?|劳烦|能不能|可不可以|可以请你?|我想要?|我要|帮我|帮忙)+/u,
  /^(现在|目前)(需要|想要?)?(让|把|来)?/u,
  /^(先)?(看(一看|一下|看)|看一下)/u,
  /^(写|做|出|生成|列|补充)(一版|一份|一个|一下|下)?/u,
];

function stripRepeat(text: string, patterns: RegExp[]): string {
  let t = text.trim();
  let prev = "";
  while (t !== prev) {
    prev = t;
    for (const re of patterns) t = t.replace(re, "").trim();
  }
  return t;
}

function topicFromKnownPrompt(raw: string): string | null {
  const t = raw.trim().replace(/\s+/gu, " ");
  if (!t) return null;
  const hit = CHAT_QUICK_PROMPTS.find(
    (p) => t === p.message || t.startsWith(p.message),
  );
  return hit?.label ?? null;
}

/** 首条提问 → 侧栏/顶栏主题（抽主题，不复述口语原句） */
export function deriveConversationTopicHeuristic(raw: string): string {
  let text = raw.trim().replace(/\s+/gu, " ");
  if (!text || FILE_ONLY.test(text)) return "文件与资料咨询";
  const known = topicFromKnownPrompt(text);
  if (known) return known;

  text = text.replace(/^请阅读刚上传[^。！？\n]*[。！？]?\s*/u, "");
  text = text.replace(/附件[：:][^\n]+/gu, "").trim();
  const sentence = (text.split(/[。！？\n]/u)[0] ?? text).trim();
  let plain = sentence.replace(/[#*_`[\]()【】]/gu, "").trim();
  if (!plain) return "新对话";

  plain = stripRepeat(plain, WRAPPERS);
  plain = plain.replace(/^(把)?(这个|该|本|此)?项目的/u, "").trim();
  plain = plain.replace(/^(全面)?分析(一下|下|一?波)?/u, (_, full) =>
    full ? "全面分析" : "",
  );
  plain = plain.replace(/(一下|下)(?=(这个|该|本|此)?项目|$)/u, "").trim();
  plain = plain.replace(/(这个|该|本|此)?(项目|案子)(吧|呀|啊|呢|呗)?$/u, "").trim();
  plain = plain.replace(/[吧呀啊呢呗哦嗯了]+$/u, "").trim();
  plain = plain.replace(/(是什么|怎么样|如何|好不好|行不行|吗)$/u, "").trim();
  plain = plain.replace(/[，、；,：:]+$/u, "").trim();

  if (!plain || plain === "分析") return "项目分析";
  if (plain.length <= 12) return plain;
  const cut = plain.slice(0, 12);
  const punct = cut.search(/[，、；,\s]/u);
  if (punct > 3) return cut.slice(0, punct).trim();
  return `${cut}…`;
}

const PLACEHOLDER_PREVIEWS = new Set([
  "尚未发送消息",
  "对话进行中",
  "对话记录",
  "基于项目资料包与对话进行分析",
]);

export function isSidebarTopicPreview(preview: string): boolean {
  const p = preview.trim();
  return p.length > 0 && !PLACEHOLDER_PREVIEWS.has(p);
}

/** 还是用户原句口吻，应重新抽主题 */
export function looksLikeRawUserRequest(preview: string): boolean {
  const p = preview.trim();
  if (!p) return false;
  return /^(帮我|请帮|请你|麻烦|能不能|我想|我要|看看|分析一下|分析下|根据尽调|生成尽调|做一版|写一版|查外部)/u.test(
    p,
  );
}

export function topicFromFirstUserMessage(msgs: { role: string; content: string }[]): string {
  const first = msgs.find((m) => m.role === "user" && m.content.trim());
  if (!first) return "对话记录";
  return deriveConversationTopicHeuristic(first.content);
}
