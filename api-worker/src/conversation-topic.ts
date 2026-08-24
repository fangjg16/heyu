import type { AppDatabase } from "./app-database";
import { USER_QUICK_PROMPTS } from "./chat-modes";
import { withResolvedDashscopeEnv } from "./llm-runtime-config";

type TopicEnv = {
  DB?: AppDatabase;
  JFO_INTERNAL_KEY?: string;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
  HERMES_MODEL?: string;
};

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
  const hit = USER_QUICK_PROMPTS.find(
    (p) => t === p.message || t.startsWith(p.message),
  );
  return hit?.label ?? null;
}

export function isFirstUserTurnInHistory(
  history: { role: string; content: string }[],
): boolean {
  return !history.some((m) => m.role === "user" && m.content.trim());
}

/** 无 LLM 时的侧栏主题兜底（与前端 src/lib/conversation-topic.ts 保持一致） */
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

function sanitizeLlmTopic(raw: string): string {
  let t = raw
    .trim()
    .replace(/^["'「『【]+|["'」』】]+$/gu, "")
    .replace(/[。！？.!?,，、；;：:]+$/u, "")
    .trim();
  if (t.length > 18) t = `${t.slice(0, 16)}…`;
  return t;
}

/** 首条用户提问 → 侧栏主题词（优先千问，失败则用启发式） */
export async function generateConversationTopic(
  env: TopicEnv,
  firstUserMessage: string,
): Promise<string> {
  const heuristic = deriveConversationTopicHeuristic(firstUserMessage);
  const resolved = await withResolvedDashscopeEnv(env);
  const key = (resolved.DASHSCOPE_API_KEY || "").trim();
  if (!key) return heuristic;

  const model = (resolved.HERMES_MODEL || "qwen-plus").trim();
  const base = (
    resolved.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  )
    .trim()
    .replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 32,
        messages: [
          {
            role: "system",
            content:
              "你是侧栏对话标题助手。根据用户首条提问，只输出一个高度概括的主题（2-8个字，名词性短语，例如「全面分析」「尽调清单」）。不要复述原句，去掉「帮我」「请」「这个项目」等口语。禁止标点、禁止解释、禁止引号。",
          },
          {
            role: "user",
            content: firstUserMessage.trim().slice(0, 600),
          },
        ],
      }),
    });
    if (!res.ok) return heuristic;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    const topic = sanitizeLlmTopic(answer);
    if (topic.length >= 2 && !/^(帮我|请帮|请你|麻烦|能不能)/u.test(topic)) {
      return topic;
    }
    return heuristic;
  } catch {
    return heuristic;
  }
}
