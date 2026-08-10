import { apiFetch } from "@/lib/api-auth";

export type LlmSettingsEnvFallback = {
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  model: string;
};

export type LlmSettings = {
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string;
  source: "db" | "env";
  envFallback: LlmSettingsEnvFallback;
  hermesConfigured: boolean;
  presets: string[];
  modelsUpdatedAt: string | null;
  modelsSource: "dashscope" | "seed";
  modelsError: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  hasDbRow: boolean;
};

export type LlmSettingsSaveResult = {
  ok: boolean;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyHint: string;
  source: "db" | "env";
  updatedAt: string | null;
  updatedBy: string | null;
};

export type LlmSettingsTestResult = {
  ok: boolean;
  model?: string;
  baseUrl?: string;
  latencyMs?: number;
  preview?: string;
  error?: string;
};

export type LlmModelsRefreshResult = {
  ok: boolean;
  presets: string[];
  modelsUpdatedAt: string | null;
  modelsSource: "dashscope" | "seed";
  modelsError: string | null;
  error?: string;
};

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    hint?: string;
  };
  const base = data.error || `请求失败（${res.status}）`;
  return data.hint ? `${base}（${data.hint}）` : base;
}

export async function fetchLlmSettings(): Promise<LlmSettings> {
  const res = await apiFetch("/api/admin/llm-settings");
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as Partial<LlmSettings> & {
    envFallback?: Partial<LlmSettingsEnvFallback>;
  };
  return {
    baseUrl: String(data.baseUrl ?? ""),
    model: String(data.model ?? ""),
    apiKeyConfigured: Boolean(data.apiKeyConfigured),
    apiKeyHint: String(data.apiKeyHint ?? ""),
    source: data.source === "db" ? "db" : "env",
    envFallback: {
      baseUrlConfigured: Boolean(data.envFallback?.baseUrlConfigured),
      apiKeyConfigured: Boolean(data.envFallback?.apiKeyConfigured),
      model: String(data.envFallback?.model ?? ""),
    },
    hermesConfigured: Boolean(data.hermesConfigured),
    presets: Array.isArray(data.presets)
      ? data.presets.map((x) => String(x)).filter(Boolean)
      : [],
    modelsUpdatedAt:
      typeof data.modelsUpdatedAt === "string" ? data.modelsUpdatedAt : null,
    modelsSource: data.modelsSource === "dashscope" ? "dashscope" : "seed",
    modelsError:
      typeof data.modelsError === "string" ? data.modelsError : null,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
    hasDbRow: Boolean(data.hasDbRow),
  };
}

export async function saveLlmSettings(input: {
  model: string;
  apiKey?: string;
  /** 可选；不传则服务端沿用已有 / 默认 Base URL */
  baseUrl?: string;
}): Promise<LlmSettingsSaveResult> {
  const res = await apiFetch("/api/admin/llm-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      ...(input.baseUrl?.trim() ? { baseUrl: input.baseUrl.trim() } : {}),
      ...(input.apiKey?.trim() ? { apiKey: input.apiKey.trim() } : {}),
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as Partial<LlmSettingsSaveResult>;
  return {
    ok: Boolean(data.ok),
    baseUrl: String(data.baseUrl ?? input.baseUrl ?? ""),
    model: String(data.model ?? input.model),
    apiKeyConfigured: Boolean(data.apiKeyConfigured),
    apiKeyHint: String(data.apiKeyHint ?? ""),
    source: data.source === "db" ? "db" : "env",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

export async function testLlmSettings(): Promise<LlmSettingsTestResult> {
  const res = await apiFetch("/api/admin/llm-settings/test", {
    method: "POST",
  });
  const data = (await res.json().catch(() => ({}))) as LlmSettingsTestResult & {
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      error:
        data.error ||
        (await readError(res).catch(() => `请求失败（${res.status}）`)),
    };
  }
  return {
    ok: Boolean(data.ok),
    model: data.model,
    baseUrl: data.baseUrl,
    latencyMs: data.latencyMs,
    preview: data.preview,
    error: data.error,
  };
}

export async function refreshLlmModels(): Promise<LlmModelsRefreshResult> {
  const res = await apiFetch("/api/admin/llm-settings/refresh-models", {
    method: "POST",
  });
  const data = (await res.json().catch(() => ({}))) as Partial<LlmModelsRefreshResult> & {
    error?: string;
  };
  const presets = Array.isArray(data.presets)
    ? data.presets.map((x) => String(x)).filter(Boolean)
    : [];
  if (!res.ok) {
    return {
      ok: false,
      presets,
      modelsUpdatedAt:
        typeof data.modelsUpdatedAt === "string" ? data.modelsUpdatedAt : null,
      modelsSource: data.modelsSource === "dashscope" ? "dashscope" : "seed",
      modelsError:
        typeof data.modelsError === "string" ? data.modelsError : null,
      error:
        data.error ||
        (await readError(res).catch(() => `请求失败（${res.status}）`)),
    };
  }
  return {
    ok: Boolean(data.ok) && !data.modelsError,
    presets,
    modelsUpdatedAt:
      typeof data.modelsUpdatedAt === "string" ? data.modelsUpdatedAt : null,
    modelsSource: data.modelsSource === "dashscope" ? "dashscope" : "seed",
    modelsError:
      typeof data.modelsError === "string" ? data.modelsError : null,
    error: data.error,
  };
}
