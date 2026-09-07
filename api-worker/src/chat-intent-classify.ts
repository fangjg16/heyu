/**
 * 对话深度任务：短语召回后再做意图判断。
 * 斜杠点名不走这里；单字「风险」「分析」不召回。
 */
import type { AnalysisKind } from "./analysis-kind";
import {
  hitsDeliverableRecall,
  skillIntentForDeliverable,
} from "./chat-kind-deliverable";
import { isKnowledgeNetworkDeliveryIntent } from "./knowledge-network-intent";
import {
  genericIntakeIntent,
  messageHitsSkillPhrases,
  parseSlashSkill,
  type SkillIntent,
} from "./chat-modes";
import {
  deliverableById,
  deliverablesForKind,
} from "./deliverable-catalog";
import { isHermesAgentConfigured } from "./hermes-agent";
import {
  callHermes,
  callQwen,
  type LlmClientEnv,
} from "./llm-client";
import { withResolvedDashscopeEnv } from "./llm-runtime-config";

export type ChatIntentClass =
  | { action: "none" }
  | { action: "file"; fileId: string }
  | { action: "generic" };

export type ResolvedChatIntent = {
  chatMode: SkillIntent;
  persistIntent: string;
};

const GENERIC_ID = "generic_intake";
const NONE_ID = "none";

export function shouldClassifyChatIntent(
  message: string,
  kind?: AnalysisKind | null,
): boolean {
  const m = (message ?? "").trim();
  if (!m) return false;
  if (parseSlashSkill(m)) return false;
  if (isKnowledgeNetworkDeliveryIntent(m)) return false;
  if (hitsDeliverableRecall(kind, m)) return true;
  return messageHitsSkillPhrases(m);
}

export function catalogIdsForKind(
  kind?: AnalysisKind | null,
): string[] {
  const files = deliverablesForKind(kind ?? "mature");
  return files.map((f) => f.id);
}

export function parseChatIntentClassification(
  raw: string,
  allowedIds: readonly string[],
): ChatIntentClass | null {
  const allowed = new Set(allowedIds);
  const text = (raw ?? "").trim();
  if (!text) return null;
  const jsonMatch =
    /\{[\s\S]*?"fileId"\s*:\s*"([^"]+)"[\s\S]*?\}/u.exec(text) ??
    /\{[\s\S]*?"id"\s*:\s*"([^"]+)"[\s\S]*?\}/u.exec(text);
  const fileId = (jsonMatch?.[1] ?? "").trim();
  if (!fileId) return null;
  if (fileId === NONE_ID) return { action: "none" };
  if (fileId === GENERIC_ID || fileId === "generic") return { action: "generic" };
  if (allowed.has(fileId)) return { action: "file", fileId };
  return null;
}

export function resolveClassifiedChatIntent(
  classified: ChatIntentClass,
  kind?: AnalysisKind | null,
): ResolvedChatIntent {
  if (classified.action === "none") {
    return { chatMode: "standard", persistIntent: "standard" };
  }
  if (classified.action === "generic") {
    const chatMode = genericIntakeIntent(kind);
    return { chatMode, persistIntent: chatMode };
  }
  const file = deliverableById(kind ?? "mature", classified.fileId);
  if (!file) {
    return { chatMode: "standard", persistIntent: "standard" };
  }
  return {
    chatMode: skillIntentForDeliverable(file) as SkillIntent,
    persistIntent: file.id,
  };
}

export function buildChatIntentClassifyPrompt(
  message: string,
  kind?: AnalysisKind | null,
): string {
  const files = deliverablesForKind(kind ?? "mature");
  const catalog = files
    .map((f) => `- ${f.id} | ${f.title}`)
    .join("\n");
  const kindLabel =
    kind === "early" ? "创业" : kind === "acquire" ? "收购" : "投研";
  return [
    `项目类型：${kindLabel}。`,
    "判断用户这句话是不是要生成下面某一份资料。",
    "只输出一行 JSON：{\"fileId\":\"...\"}",
    `fileId 只能是下列 id 之一，或 ${NONE_ID}，或 ${GENERIC_ID}。`,
    "",
    "目录：",
    catalog,
    "",
    "规则：",
    "- 用户明确要生成某份（做一版/写一份/想要某标题）→ 该份 id。",
    "- 「除了 / 不要 / 先别写 / 不是」某份：不要选被排除的那份。",
    "- 排除之后还要另一份 → 选那一份。",
    "- 排除之后没有别的生成请求、或只是随口问/闲聊 → none。",
    "- 要尽调、深度分析、全面分析，但没点名某一份目录文件 → generic_intake。",
    "- 拿不准 → none。不要猜。",
    "",
    `用户原话：${message.trim()}`,
  ].join("\n");
}

async function oneShotClassifyLlm(
  env: LlmClientEnv,
  prompt: string,
): Promise<string | null> {
  const messages = [
    {
      role: "system",
      content:
        "你是意图分类器。只输出一行 JSON，不要解释，不要 Markdown。",
    },
    { role: "user", content: prompt },
  ];
  try {
    const resolved = await withResolvedDashscopeEnv(env);
    if ((resolved.DASHSCOPE_API_KEY || "").trim()) {
      const { answer } = await callQwen(resolved, messages);
      return answer;
    }
    if (isHermesAgentConfigured(resolved)) {
      const { answer } = await callHermes(resolved, messages);
      return answer;
    }
  } catch {
    return null;
  }
  return null;
}

/** 分类失败返回 null，调用方回退正则。 */
export async function classifyChatIntent(
  env: LlmClientEnv,
  message: string,
  kind?: AnalysisKind | null,
): Promise<ChatIntentClass | null> {
  const raw = await oneShotClassifyLlm(
    env,
    buildChatIntentClassifyPrompt(message, kind),
  );
  if (raw == null) return null;
  return parseChatIntentClassification(raw, catalogIdsForKind(kind));
}
