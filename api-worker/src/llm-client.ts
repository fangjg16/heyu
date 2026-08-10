import {
  isHermesAgentConfigured,
  normalizeHermesApiKey,
  type HermesAgentEnv,
} from "./hermes-agent";
import {
  assertValidHermesBaseUrl,
  listHermesChatCompletionsUrls,
} from "./hermes-url";
import {
  withResolvedDashscopeEnv,
  type LlmRuntimeEnv,
} from "./llm-runtime-config";

export type LlmClientEnv = HermesAgentEnv &
  LlmRuntimeEnv & {
    DASHSCOPE_API_KEY?: string;
    DASHSCOPE_BASE_URL?: string;
    HERMES_MODEL?: string;
  };

export type LlmMessage = { role: string; content: string };

export async function callChatCompletions(
  url: string,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
  label: string,
): Promise<{ answer: string; raw: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  const rawText = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    if (/<!doctype html/i.test(rawText)) {
      throw new Error(
        `${label} 返回了网页而非 API。请检查服务地址（Railway 常见误指 Dashboard 9119）。`,
      );
    }
    throw new Error(`${label} 返回非 JSON（HTTP ${res.status}）`);
  }

  if (!res.ok) {
    const err =
      (raw.error as { message?: string } | undefined)?.message ||
      (raw.detail as string) ||
      (raw.message as string) ||
      `${label} HTTP ${res.status}`;
    throw new Error(String(err));
  }

  const choice = raw.choices as { message?: { content?: string } }[] | undefined;
  const answer =
    choice?.[0]?.message?.content?.trim() ||
    (raw.answer as string) ||
    (raw.output as string) ||
    "";

  return { answer: answer || "模型未返回正文。", raw };
}

export async function callQwen(env: LlmClientEnv, messages: LlmMessage[]) {
  const resolved = await withResolvedDashscopeEnv(env);
  const key = (resolved.DASHSCOPE_API_KEY || "").trim();
  const model = (resolved.HERMES_MODEL || "qwen-plus").trim();
  const base = (
    resolved.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  )
    .trim()
    .replace(/\/$/, "");
  if (!key) {
    throw new Error("未配置 DASHSCOPE_API_KEY（也未在管理台保存 API Key）");
  }
  return callChatCompletions(
    `${base}/chat/completions`,
    key,
    model,
    messages,
    "千问",
  );
}

export async function callHermes(env: LlmClientEnv, messages: LlmMessage[]) {
  const resolved = await withResolvedDashscopeEnv(env);
  const rawBase = (env.HERMES_BASE_URL || "").trim();
  const key = normalizeHermesApiKey(env.HERMES_API_KEY);
  const model = (resolved.HERMES_MODEL || "qwen-plus").trim();
  if (!rawBase || !key) {
    throw new Error("HERMES_BASE_URL 或 HERMES_API_KEY 未配置");
  }
  assertValidHermesBaseUrl(rawBase);
  const urls = listHermesChatCompletionsUrls(rawBase);
  let lastErr = "Hermes chat 不可用";
  for (const url of urls) {
    try {
      return await callChatCompletions(url, key, model, messages, "Hermes");
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (/401|403|404|405/u.test(lastErr)) continue;
      throw e;
    }
  }
  throw new Error(lastErr);
}

function isHermesAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("unauthorized") ||
    m.includes("invalid api key") ||
    m.includes("authentication") ||
    /\b401\b/.test(m) ||
    /\b403\b/.test(m)
  );
}

/** Hermes 已接通但上游模型 URL/密钥未配好时，可降级千问 */
function isHermesUpstreamMisconfigError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid url") ||
    m.includes("undefined") ||
    m.includes("返回了网页") ||
    m.includes("enotfound") ||
    m.includes("fetch failed") ||
    // Hermes/代理偶发把上游异常收成 Cloudflare 风格文案
    m.includes("internal error; reference")
  );
}

export function shouldFallbackToDashscope(hermesErrorMessage: string): boolean {
  return (
    isHermesAuthError(hermesErrorMessage) ||
    isHermesUpstreamMisconfigError(hermesErrorMessage)
  );
}

export async function callLlm(
  env: LlmClientEnv,
  messages: LlmMessage[],
): Promise<{ answer: string; raw: unknown; llmBackend: string }> {
  const resolved = await withResolvedDashscopeEnv(env);
  const dashscopeReady = Boolean((resolved.DASHSCOPE_API_KEY || "").trim());

  if (isHermesAgentConfigured(env)) {
    try {
      const result = await callHermes(resolved, messages);
      return { ...result, llmBackend: "hermes-chat" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (dashscopeReady && shouldFallbackToDashscope(msg)) {
        const result = await callQwen(resolved, messages);
        return { ...result, llmBackend: "dashscope-fallback" };
      }
      throw e;
    }
  }

  if (dashscopeReady) {
    const result = await callQwen(resolved, messages);
    return { ...result, llmBackend: "dashscope" };
  }

  throw new Error(
    "未配置 HERMES_BASE_URL/HERMES_API_KEY，也未配置 DASHSCOPE_API_KEY（或管理台 API Key）",
  );
}
