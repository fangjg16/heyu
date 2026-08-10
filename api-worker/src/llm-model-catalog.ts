import type { AppDatabase } from "./app-database";
import { DEFAULT_LLM_BASE_URL } from "./platform-llm-settings-db";
import { resolveLlmRuntimeConfig } from "./llm-runtime-config";

export const PLATFORM_LLM_MODEL_CATALOG_ID = 1;

/** 24h 懒刷新 */
export const MODEL_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

/** 文档汇总的文本聊天兜底清单（拉取失败时使用） */
export const LLM_CHAT_MODEL_SEED = [
  "qwen3.7-plus",
  "qwen-plus",
  "qwen-plus-latest",
  "qwen-max",
  "qwen-max-latest",
  "qwen-flash",
  "qwen-turbo",
] as const;

/** @deprecated 使用 LLM_CHAT_MODEL_SEED */
export const LLM_MODEL_PRESETS = LLM_CHAT_MODEL_SEED;

export type ModelCatalogSource = "dashscope" | "seed";

export type ModelCatalogResult = {
  models: string[];
  fetchedAt: string | null;
  source: ModelCatalogSource;
  error: string | null;
};

type CatalogRow = {
  id: number;
  models_json: string;
  fetched_at: string;
  source: string;
  error: string | null;
};

const EXCLUDE_RE =
  /embedding|tts|wanx|paraformer|asr|speech|audio|rerank|omni-realtime|image|vision-ocr|iic\/|sambert|cosyvoice|farui|tongyi-tingwu/iu;

function isLikelyChatModelId(id: string): boolean {
  const t = id.trim();
  if (!t || t.length > 128) return false;
  if (EXCLUDE_RE.test(t)) return false;
  // 文本 / 推理类 Qwen 家族
  if (/^qwen/iu.test(t) || /^qwq/iu.test(t) || /^qvq/iu.test(t)) return true;
  return false;
}

export function filterChatModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    if (!isLikelyChatModelId(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort((a, b) => a.localeCompare(b, "en"));
  return out;
}

function parseModelsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return filterChatModelIds(parsed.map((x) => String(x)));
  } catch {
    return [];
  }
}

export function isModelCatalogTableMissing(msg: string): boolean {
  return (
    /Unknown table ['`]?platform_llm_model_catalog['`]?/i.test(msg) ||
    /no such table:\s*platform_llm_model_catalog/i.test(msg)
  );
}

export async function readModelCatalogRow(
  db: AppDatabase,
): Promise<ModelCatalogResult | null> {
  try {
    const row = await db
      .prepare(
        `SELECT id, models_json, fetched_at, source, error
         FROM platform_llm_model_catalog WHERE id = ?`,
      )
      .bind(PLATFORM_LLM_MODEL_CATALOG_ID)
      .first<CatalogRow>();
    if (!row) return null;
    const models = parseModelsJson(row.models_json ?? "[]");
    const source: ModelCatalogSource =
      row.source === "dashscope" ? "dashscope" : "seed";
    return {
      models: models.length > 0 ? models : [...LLM_CHAT_MODEL_SEED],
      fetchedAt: row.fetched_at || null,
      source: models.length > 0 ? source : "seed",
      error: row.error?.trim() ? row.error.trim() : null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isModelCatalogTableMissing(msg)) return null;
    throw e;
  }
}

export async function writeModelCatalog(
  db: AppDatabase,
  input: {
    models: string[];
    source: ModelCatalogSource;
    error?: string | null;
  },
): Promise<ModelCatalogResult> {
  const now = new Date().toISOString();
  const models = filterChatModelIds(input.models);
  const finalModels = models.length > 0 ? models : [...LLM_CHAT_MODEL_SEED];
  const source: ModelCatalogSource =
    models.length > 0 ? input.source : "seed";
  await db
    .prepare(
      `INSERT INTO platform_llm_model_catalog
         (id, models_json, fetched_at, source, error)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         models_json = VALUES(models_json),
         fetched_at = VALUES(fetched_at),
         source = VALUES(source),
         error = VALUES(error)`,
    )
    .bind(
      PLATFORM_LLM_MODEL_CATALOG_ID,
      JSON.stringify(finalModels),
      now,
      source,
      input.error?.trim() ? input.error.trim().slice(0, 500) : null,
    )
    .run();
  return {
    models: finalModels,
    fetchedAt: now,
    source,
    error: input.error?.trim() ? input.error.trim().slice(0, 500) : null,
  };
}

export async function fetchDashScopeModels(
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/$/, "") || DEFAULT_LLM_BASE_URL;
  const key = apiKey.trim();
  if (!key) throw new Error("缺少 API Key，无法拉取模型列表");

  const res = await fetch(`${base}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });
  const rawText = await res.text();
  let raw: { data?: { id?: string }[]; error?: { message?: string } } = {};
  try {
    raw = rawText ? (JSON.parse(rawText) as typeof raw) : {};
  } catch {
    throw new Error(
      `DashScope /models 返回非 JSON（HTTP ${res.status}）`,
    );
  }
  if (!res.ok) {
    const err =
      raw.error?.message ||
      `DashScope /models HTTP ${res.status}`;
    throw new Error(String(err));
  }
  const ids = (raw.data ?? [])
    .map((x) => (typeof x?.id === "string" ? x.id : ""))
    .filter(Boolean);
  const filtered = filterChatModelIds(ids);
  if (filtered.length === 0) {
    throw new Error("DashScope /models 未返回可用的文本聊天模型");
  }
  return filtered;
}

function isStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true;
  const t = Date.parse(fetchedAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > MODEL_CATALOG_TTL_MS;
}

export type CatalogEnv = {
  DB: AppDatabase;
  JFO_INTERNAL_KEY?: string;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_BASE_URL?: string;
  HERMES_MODEL?: string;
};

/**
 * 读缓存；过期且有 Key 时懒刷新。
 * force=true 时强制拉取（无 Key 则抛错）。
 */
export async function getModelCatalog(
  env: CatalogEnv,
  options?: { force?: boolean },
): Promise<ModelCatalogResult> {
  const force = Boolean(options?.force);
  const cached = await readModelCatalogRow(env.DB);
  const resolved = await resolveLlmRuntimeConfig(env);
  const hasKey = Boolean(resolved.apiKey);

  const needRefresh =
    force || !cached || isStale(cached.fetchedAt);

  if (needRefresh && hasKey) {
    try {
      const models = await fetchDashScopeModels(
        resolved.baseUrl,
        resolved.apiKey,
      );
      return await writeModelCatalog(env.DB, {
        models,
        source: "dashscope",
        error: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (force) {
        if (cached && cached.models.length > 0) {
          return { ...cached, error: msg };
        }
        throw e;
      }
      // 懒刷新失败：返回旧缓存或 seed
      if (cached && cached.models.length > 0) {
        return { ...cached, error: msg };
      }
      return {
        models: [...LLM_CHAT_MODEL_SEED],
        fetchedAt: null,
        source: "seed",
        error: msg,
      };
    }
  }

  if (force && !hasKey) {
    throw new Error("请先保存 API Key，再刷新模型列表");
  }

  if (cached && cached.models.length > 0) {
    return cached;
  }

  // 无缓存：写入 seed 便于后续展示
  try {
    return await writeModelCatalog(env.DB, {
      models: [...LLM_CHAT_MODEL_SEED],
      source: "seed",
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isModelCatalogTableMissing(msg)) {
      return {
        models: [...LLM_CHAT_MODEL_SEED],
        fetchedAt: null,
        source: "seed",
        error: null,
      };
    }
    return {
      models: [...LLM_CHAT_MODEL_SEED],
      fetchedAt: null,
      source: "seed",
      error: msg,
    };
  }
}
