import type { AppDatabase } from "./app-database";
import { isHermesAgentConfigured, type HermesAgentEnv } from "./hermes-agent";
import { callChatCompletions } from "./llm-client";
import {
  getModelCatalog,
  isModelCatalogTableMissing,
  LLM_CHAT_MODEL_SEED,
} from "./llm-model-catalog";
import {
  resolveLlmRuntimeConfig,
  withResolvedDashscopeEnv,
} from "./llm-runtime-config";
import {
  formatApiKeyMask,
  requireEncryptionSecret,
} from "./platform-llm-settings-crypto";
import {
  DEFAULT_LLM_BASE_URL,
  getPlatformLlmSettings,
  isPlatformLlmSettingsTableMissing,
  upsertPlatformLlmSettings,
} from "./platform-llm-settings-db";
import { isPlatformAdmin } from "./projects-auth";

type Env = {
  DB: AppDatabase;
  JFO_INTERNAL_KEY?: string;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
  HERMES_MODEL?: string;
} & HermesAgentEnv;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function requirePlatformAdmin(
  env: Env,
  authUserId: string,
): Promise<Response | null> {
  if (!(await isPlatformAdmin(env, authUserId))) {
    return json({ error: "需要平台管理员权限", code: "FORBIDDEN" }, 403);
  }
  return null;
}

function tableMissingResponse(msg: string): Response | null {
  if (
    isPlatformLlmSettingsTableMissing(msg) ||
    isModelCatalogTableMissing(msg)
  ) {
    return json(
      {
        error:
          "表未迁移：请执行 migration 0021/0022（platform_llm_settings / model_catalog）后重试",
      },
      503,
    );
  }
  return null;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** GET /api/admin/llm-settings */
export async function handleAdminGetLlmSettings(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  try {
    const stored = await getPlatformLlmSettings(env.DB);
    const resolved = await resolveLlmRuntimeConfig(env);
    const catalog = await getModelCatalog(env, { force: false });
    const envKeyConfigured = Boolean((env.DASHSCOPE_API_KEY || "").trim());
    const envBase = (
      env.DASHSCOPE_BASE_URL || DEFAULT_LLM_BASE_URL
    )
      .trim()
      .replace(/\/$/, "");
    const envModel = (env.HERMES_MODEL || "qwen-plus").trim() || "qwen-plus";

    const apiKeyConfigured = Boolean(resolved.apiKey);
    const apiKeyHint = stored?.apiKeyHint
      ? formatApiKeyMask(stored.apiKeyHint)
      : envKeyConfigured
        ? formatApiKeyMask(
            (env.DASHSCOPE_API_KEY || "").trim().slice(-4),
          )
        : "";

    const presets =
      catalog.models.length > 0
        ? catalog.models
        : [...LLM_CHAT_MODEL_SEED];

    return json({
      baseUrl: stored?.baseUrl || resolved.baseUrl || envBase,
      model: stored?.model || resolved.model || envModel,
      apiKeyConfigured,
      apiKeyHint,
      source: resolved.source,
      envFallback: {
        baseUrlConfigured: Boolean((env.DASHSCOPE_BASE_URL || "").trim()),
        apiKeyConfigured: envKeyConfigured,
        model: envModel,
      },
      hermesConfigured: isHermesAgentConfigured(env),
      presets,
      modelsUpdatedAt: catalog.fetchedAt,
      modelsSource: catalog.source,
      modelsError: catalog.error,
      updatedAt: stored?.updatedAt ?? null,
      updatedBy: stored?.updatedBy ?? null,
      hasDbRow: Boolean(stored),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return tableMissingResponse(msg) ?? json({ error: msg }, 500);
  }
}

/** PUT /api/admin/llm-settings */
export async function handleAdminPutLlmSettings(
  request: Request,
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  let body: {
    baseUrl?: unknown;
    model?: unknown;
    apiKey?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "无效 JSON" }, 400);
  }

  const model =
    typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return json({ error: "model 不能为空" }, 400);
  if (model.length > 128) return json({ error: "model 过长" }, 400);

  try {
    const existing = await getPlatformLlmSettings(env.DB);

    let baseUrl =
      typeof body.baseUrl === "string"
        ? normalizeBaseUrl(body.baseUrl)
        : existing?.baseUrl ||
          normalizeBaseUrl(env.DASHSCOPE_BASE_URL || DEFAULT_LLM_BASE_URL);
    if (!baseUrl) baseUrl = DEFAULT_LLM_BASE_URL;
    if (!isValidHttpUrl(baseUrl)) {
      return json({ error: "baseUrl 必须是合法的 http(s) URL" }, 400);
    }

    const apiKeyPlain =
      typeof body.apiKey === "string" ? body.apiKey.trim() : "";

    if (apiKeyPlain) {
      try {
        requireEncryptionSecret(env.JFO_INTERNAL_KEY);
      } catch (e) {
        return json(
          {
            error: e instanceof Error ? e.message : String(e),
          },
          503,
        );
      }
    }

    const saved = await upsertPlatformLlmSettings(
      env.DB,
      {
        baseUrl,
        model,
        apiKeyPlain: apiKeyPlain || undefined,
        jfoInternalKey: (env.JFO_INTERNAL_KEY || "").trim(),
      },
      authUserId,
    );
    const resolved = await resolveLlmRuntimeConfig(env);
    return json({
      ok: true,
      baseUrl: saved.baseUrl,
      model: saved.model,
      apiKeyConfigured: Boolean(resolved.apiKey),
      apiKeyHint: saved.apiKeyHint
        ? formatApiKeyMask(saved.apiKeyHint)
        : "",
      source: "db",
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return tableMissingResponse(msg) ?? json({ error: msg }, 500);
  }
}

/** POST /api/admin/llm-settings/test — 用当前解析配置打一次短请求 */
export async function handleAdminTestLlmSettings(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  try {
    const resolved = await withResolvedDashscopeEnv(env);
    const key = (resolved.DASHSCOPE_API_KEY || "").trim();
    const model = (resolved.HERMES_MODEL || "qwen-plus").trim();
    const base = (
      resolved.DASHSCOPE_BASE_URL || DEFAULT_LLM_BASE_URL
    )
      .trim()
      .replace(/\/$/, "");

    if (!key) {
      return json(
        {
          ok: false,
          error: "未配置 API Key（管理台与环境变量均无）",
        },
        400,
      );
    }

    const started = Date.now();
    const result = await callChatCompletions(
      `${base}/chat/completions`,
      key,
      model,
      [
        {
          role: "user",
          content: "只回复一个字：好",
        },
      ],
      "连通性测试",
    );
    return json({
      ok: true,
      model,
      baseUrl: base,
      latencyMs: Date.now() - started,
      preview: (result.answer || "").slice(0, 80),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return tableMissingResponse(msg) ?? json({ ok: false, error: msg }, 502);
  }
}

/** POST /api/admin/llm-settings/refresh-models — 强制从 DashScope 拉取模型列表 */
export async function handleAdminRefreshLlmModels(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  try {
    const catalog = await getModelCatalog(env, { force: true });
    return json({
      ok: !catalog.error,
      presets: catalog.models,
      modelsUpdatedAt: catalog.fetchedAt,
      modelsSource: catalog.source,
      modelsError: catalog.error,
      error: catalog.error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      tableMissingResponse(msg) ??
      json({ ok: false, error: msg, presets: [...LLM_CHAT_MODEL_SEED] }, 400)
    );
  }
}
