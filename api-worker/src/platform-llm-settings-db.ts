import type { AppDatabase } from "./app-database";
import {
  apiKeyHintFromPlaintext,
  decryptApiKey,
  encryptApiKey,
} from "./platform-llm-settings-crypto";

export const PLATFORM_LLM_SETTINGS_ID = 1;

export const DEFAULT_LLM_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

export type PlatformLlmSettingsRow = {
  id: number;
  base_url: string;
  model: string;
  api_key_enc: string | null;
  api_key_hint: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type PlatformLlmSettingsStored = {
  baseUrl: string;
  model: string;
  apiKeyEnc: string | null;
  apiKeyHint: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

function rowToStored(r: PlatformLlmSettingsRow): PlatformLlmSettingsStored {
  return {
    baseUrl: (r.base_url ?? "").trim(),
    model: (r.model ?? "").trim(),
    apiKeyEnc: r.api_key_enc?.trim() ? r.api_key_enc.trim() : null,
    apiKeyHint: r.api_key_hint?.trim() ? r.api_key_hint.trim() : null,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export async function getPlatformLlmSettings(
  db: AppDatabase,
): Promise<PlatformLlmSettingsStored | null> {
  const row = await db
    .prepare(
      `SELECT id, base_url, model, api_key_enc, api_key_hint, updated_at, updated_by
       FROM platform_llm_settings WHERE id = ?`,
    )
    .bind(PLATFORM_LLM_SETTINGS_ID)
    .first<PlatformLlmSettingsRow>();
  return row ? rowToStored(row) : null;
}

export async function upsertPlatformLlmSettings(
  db: AppDatabase,
  input: {
    baseUrl: string;
    model: string;
    /** 有值则更新加密密钥；undefined/空则保留原密钥 */
    apiKeyPlain?: string | null;
    jfoInternalKey: string;
  },
  updatedBy: string,
): Promise<PlatformLlmSettingsStored> {
  const existing = await getPlatformLlmSettings(db);
  const now = new Date().toISOString();
  const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
  const model = input.model.trim();
  if (!baseUrl) throw new Error("baseUrl 不能为空");
  if (!model) throw new Error("model 不能为空");

  let apiKeyEnc = existing?.apiKeyEnc ?? null;
  let apiKeyHint = existing?.apiKeyHint ?? null;
  const nextKey = (input.apiKeyPlain ?? "").trim();
  if (nextKey) {
    apiKeyEnc = await encryptApiKey(input.jfoInternalKey, nextKey);
    apiKeyHint = apiKeyHintFromPlaintext(nextKey);
  }

  await db
    .prepare(
      `INSERT INTO platform_llm_settings
         (id, base_url, model, api_key_enc, api_key_hint, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         base_url = VALUES(base_url),
         model = VALUES(model),
         api_key_enc = VALUES(api_key_enc),
         api_key_hint = VALUES(api_key_hint),
         updated_at = VALUES(updated_at),
         updated_by = VALUES(updated_by)`,
    )
    .bind(
      PLATFORM_LLM_SETTINGS_ID,
      baseUrl,
      model,
      apiKeyEnc,
      apiKeyHint,
      now,
      updatedBy,
    )
    .run();

  const saved = await getPlatformLlmSettings(db);
  if (!saved) throw new Error("保存后读取失败");
  return saved;
}

export async function decryptStoredApiKey(
  jfoInternalKey: string,
  stored: PlatformLlmSettingsStored | null,
): Promise<string | null> {
  if (!stored?.apiKeyEnc) return null;
  try {
    return await decryptApiKey(jfoInternalKey, stored.apiKeyEnc);
  } catch {
    return null;
  }
}

export function isPlatformLlmSettingsTableMissing(msg: string): boolean {
  return (
    /Unknown table ['`]?platform_llm_settings['`]?/i.test(msg) ||
    /no such table:\s*platform_llm_settings/i.test(msg)
  );
}
