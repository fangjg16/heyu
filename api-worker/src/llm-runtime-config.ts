import type { AppDatabase } from "./app-database";
import {
  decryptStoredApiKey,
  DEFAULT_LLM_BASE_URL,
  getPlatformLlmSettings,
  isPlatformLlmSettingsTableMissing,
} from "./platform-llm-settings-db";

export type LlmRuntimeEnv = {
  DB?: AppDatabase;
  JFO_INTERNAL_KEY?: string;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
  HERMES_MODEL?: string;
  /** 源文件扫描件/图片 OCR，默认 qwen3.5-ocr */
  QWEN_OCR_MODEL?: string;
  /** 对话看图，默认 qwen3-vl-plus */
  QWEN_VL_MODEL?: string;
};

export type LlmRuntimeConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 是否至少有一项来自 DB 覆盖 */
  source: "db" | "env";
  apiKeyFromDb: boolean;
};

function envDefaults(env: LlmRuntimeEnv): {
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  return {
    baseUrl: (
      env.DASHSCOPE_BASE_URL || DEFAULT_LLM_BASE_URL
    )
      .trim()
      .replace(/\/$/, ""),
    apiKey: (env.DASHSCOPE_API_KEY || "").trim(),
    model: (env.HERMES_MODEL || "qwen-plus").trim() || "qwen-plus",
  };
}

/**
 * 优先读 platform_llm_settings，缺字段回退 env。
 * 表未迁移时静默回退 env。
 */
export async function resolveLlmRuntimeConfig(
  env: LlmRuntimeEnv,
): Promise<LlmRuntimeConfig> {
  const fallback = envDefaults(env);
  if (!env.DB) {
    return { ...fallback, source: "env", apiKeyFromDb: false };
  }

  try {
    const stored = await getPlatformLlmSettings(env.DB);
    if (!stored) {
      return { ...fallback, source: "env", apiKeyFromDb: false };
    }

    const dbKey = await decryptStoredApiKey(
      (env.JFO_INTERNAL_KEY || "").trim(),
      stored,
    );

    const baseUrl = stored.baseUrl || fallback.baseUrl;
    const model = stored.model || fallback.model;
    const apiKeyFromDb = Boolean(dbKey);
    const apiKey = dbKey || fallback.apiKey;
    const usedDb =
      Boolean(stored.baseUrl) ||
      Boolean(stored.model) ||
      apiKeyFromDb;

    return {
      baseUrl,
      model,
      apiKey,
      source: usedDb ? "db" : "env",
      apiKeyFromDb,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isPlatformLlmSettingsTableMissing(msg)) {
      return { ...fallback, source: "env", apiKeyFromDb: false };
    }
    // 解密失败等：仍尽量用 DB 的 model/baseUrl + env key
    try {
      const stored = await getPlatformLlmSettings(env.DB);
      if (stored) {
        return {
          baseUrl: stored.baseUrl || fallback.baseUrl,
          model: stored.model || fallback.model,
          apiKey: fallback.apiKey,
          source: "db",
          apiKeyFromDb: false,
        };
      }
    } catch {
      /* ignore */
    }
    return { ...fallback, source: "env", apiKeyFromDb: false };
  }
}

/** 将解析结果叠到 env，供 callLlm / 流式路径复用 */
export async function withResolvedDashscopeEnv<T extends LlmRuntimeEnv>(
  env: T,
): Promise<
  T & {
    DASHSCOPE_API_KEY: string;
    DASHSCOPE_BASE_URL: string;
    HERMES_MODEL: string;
  }
> {
  const cfg = await resolveLlmRuntimeConfig(env);
  return {
    ...env,
    DASHSCOPE_API_KEY: cfg.apiKey,
    DASHSCOPE_BASE_URL: cfg.baseUrl,
    HERMES_MODEL: cfg.model,
  };
}
