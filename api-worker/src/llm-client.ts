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
    QWEN_VL_MODEL?: string;
    /** 本机 Node helper：大扫描 PDF 按页栅格（workerd 不能 import canvas） */
    JFO_NODE_HELPER_BASE?: string;
  };

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LlmMessage = { role: string; content: string | LlmContentPart[] };

export type LlmCallOptions = {
  /** 看图回合走百炼视觉模型，不经 Hermes */
  forceDashscope?: boolean;
  model?: string;
};

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
    // Qwen3.x：关闭 thinking，避免只返回 reasoning_content、content 为空
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      enable_thinking: false,
    }),
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

  const choice = raw.choices as
    | {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
        };
      }[]
    | undefined;
  const message = choice?.[0]?.message;
  const answer =
    message?.content?.trim() ||
    message?.reasoning_content?.trim() ||
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

export async function callDashscopeModel(
  env: LlmClientEnv,
  messages: LlmMessage[],
  model: string,
  label = "千问",
) {
  const resolved = await withResolvedDashscopeEnv(env);
  const key = (resolved.DASHSCOPE_API_KEY || "").trim();
  const base = (
    resolved.DASHSCOPE_BASE_URL ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  )
    .trim()
    .replace(/\/$/, "");
  if (!key) {
    throw new Error("未配置 DASHSCOPE_API_KEY（也未在管理台保存 API Key）");
  }
  const use = (model || "").trim() || (resolved.HERMES_MODEL || "qwen-plus").trim();
  return callChatCompletions(`${base}/chat/completions`, key, use, messages, label);
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

/** Hermes 地址指到 Dashboard 网页等配置错误时，轻问才可降级千问。连通失败必须修 Hermes，不走 plan B。 */
function isHermesUpstreamMisconfigError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("返回了网页") || (m.includes("invalid url") && m.includes("undefined"));
}

export function shouldFallbackToDashscope(hermesErrorMessage: string): boolean {
  return (
    isHermesAuthError(hermesErrorMessage) ||
    isHermesUpstreamMisconfigError(hermesErrorMessage)
  );
}

/** 把上游偶发的 Cloudflare/网关英文错误改成用户可读中文 */
export function humanizeUpstreamLlmError(raw: string): string {
  const msg = (raw ?? "").trim();
  if (!msg) return "Hermes 引擎暂时无响应，请稍后重试。";
  if (/internal error;\s*reference\s*=/i.test(msg)) {
    return "无法连接 Hermes 引擎。请在 ECS 重建 jfo-api 后重试。";
  }
  if (/hermes 上游不可达/i.test(msg)) {
    return msg;
  }
  if (/too many requests|rate limit|429/i.test(msg)) {
    return "模型请求过于频繁，请稍后重试。";
  }
  return msg;
}

/** 限流、网关、瞬时断连可退避；鉴权/缺配置立即失败。 */
export function isRetryableLlmError(raw: string): boolean {
  const msg = (raw ?? "").trim();
  if (!msg) return false;
  if (
    /未配置|invalid api key|unauthorized|authentication|缺少 userId/i.test(msg)
  ) {
    return false;
  }
  if (/\b401\b|\b403\b/.test(msg) && !/429/.test(msg)) return false;
  return /429|rate limit|too many requests|throttl|过于频繁|限流|fetch failed|network|econnreset|etimedout|socket|502|503|504|overloaded|capacity|timeout|timed out|unavailable|temporarily|bad gateway|gateway timeout/i.test(
    msg,
  );
}

const LLM_RETRY_ATTEMPTS = 4;

export function llmRetryDelayMs(attempt: number): number {
  const n = Math.max(1, attempt);
  return Math.min(16_000, 1000 * 2 ** n);
}

async function callLlmOnce(
  env: LlmClientEnv,
  messages: LlmMessage[],
  options?: LlmCallOptions,
): Promise<{ answer: string; raw: unknown; llmBackend: string }> {
  const resolved = await withResolvedDashscopeEnv(env);
  const dashscopeReady = Boolean((resolved.DASHSCOPE_API_KEY || "").trim());
  const modelOverride = (options?.model || "").trim();

  if (options?.forceDashscope) {
    if (!dashscopeReady) {
      throw new Error("看图需要 DASHSCOPE_API_KEY（或管理台 API Key）");
    }
    const result = await callDashscopeModel(
      resolved,
      messages,
      modelOverride || (resolved.HERMES_MODEL || "qwen-plus").trim(),
      "千问视觉",
    );
    return { ...result, llmBackend: "dashscope-vl" };
  }

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
    const result = modelOverride
      ? await callDashscopeModel(resolved, messages, modelOverride)
      : await callQwen(resolved, messages);
    return { ...result, llmBackend: "dashscope" };
  }

  throw new Error(
    "未配置 HERMES_BASE_URL/HERMES_API_KEY，也未配置 DASHSCOPE_API_KEY（或管理台 API Key）",
  );
}

export async function callLlm(
  env: LlmClientEnv,
  messages: LlmMessage[],
  options?: LlmCallOptions,
): Promise<{ answer: string; raw: unknown; llmBackend: string }> {
  let last: unknown;
  for (let attempt = 1; attempt <= LLM_RETRY_ATTEMPTS; attempt++) {
    try {
      return await callLlmOnce(env, messages, options);
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= LLM_RETRY_ATTEMPTS || !isRetryableLlmError(msg)) {
        throw e;
      }
      const delay =
        llmRetryDelayMs(attempt) + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
