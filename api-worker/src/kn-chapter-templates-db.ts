import type { AppDatabase } from "./app-database";

export const KN_PROMPT_SETTING_GENERATE_SYSTEM = "generate_system";

export type KnChapterTemplateRow = {
  id: string;
  group_id: string;
  group_label: string;
  title: string;
  kicker: string | null;
  canonical_hint: string | null;
  markdown: string;
  format_hint: string | null;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
};

export type KnChapterTemplatePublic = {
  id: string;
  groupId: string;
  groupLabel: string;
  title: string;
  kicker: string | null;
  canonicalHint: string | null;
  markdown: string;
  formatHint: string | null;
  sortOrder: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type KnPromptSettingPublic = {
  settingKey: string;
  value: string;
  updatedAt: string;
  updatedBy: string | null;
};

export function rowToKnChapterTemplate(r: KnChapterTemplateRow): KnChapterTemplatePublic {
  return {
    id: r.id,
    groupId: r.group_id,
    groupLabel: r.group_label,
    title: r.title,
    kicker: r.kicker,
    canonicalHint: r.canonical_hint,
    markdown: r.markdown,
    formatHint: r.format_hint ?? null,
    sortOrder: Number(r.sort_order) || 0,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

const TEMPLATE_SELECT = `SELECT id, group_id, group_label, title, kicker, canonical_hint, markdown,
              format_hint, sort_order, updated_at, updated_by
       FROM knowledge_network_chapter_templates`;

export async function listKnChapterTemplates(
  db: AppDatabase,
): Promise<KnChapterTemplatePublic[]> {
  const q = await db
    .prepare(`${TEMPLATE_SELECT} ORDER BY sort_order ASC, id ASC`)
    .all<KnChapterTemplateRow>();
  return (q.results ?? []).map(rowToKnChapterTemplate);
}

export async function getKnChapterTemplate(
  db: AppDatabase,
  id: string,
): Promise<KnChapterTemplatePublic | null> {
  const row = await db
    .prepare(`${TEMPLATE_SELECT} WHERE id = ?`)
    .bind(id)
    .first<KnChapterTemplateRow>();
  return row ? rowToKnChapterTemplate(row) : null;
}

export async function updateKnChapterTemplateMarkdown(
  db: AppDatabase,
  id: string,
  markdown: string,
  updatedBy: string,
): Promise<KnChapterTemplatePublic | null> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE knowledge_network_chapter_templates
       SET markdown = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    )
    .bind(markdown, now, updatedBy, id)
    .run();
  return getKnChapterTemplate(db, id);
}

/** 更新 markdown 与/或 format_hint（至少一项） */
export async function updateKnChapterTemplateContent(
  db: AppDatabase,
  id: string,
  input: {
    markdown?: string;
    formatHint?: string | null;
  },
  updatedBy: string,
): Promise<KnChapterTemplatePublic | null> {
  const existing = await getKnChapterTemplate(db, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const markdown =
    typeof input.markdown === "string" ? input.markdown : existing.markdown;
  const formatHint =
    input.formatHint !== undefined ? input.formatHint : existing.formatHint;
  await db
    .prepare(
      `UPDATE knowledge_network_chapter_templates
       SET markdown = ?, format_hint = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    )
    .bind(markdown, formatHint, now, updatedBy, id)
    .run();
  return getKnChapterTemplate(db, id);
}

export async function getPromptSetting(
  db: AppDatabase,
  settingKey: string,
): Promise<KnPromptSettingPublic | null> {
  const row = await db
    .prepare(
      `SELECT setting_key, value, updated_at, updated_by
       FROM knowledge_network_prompt_settings WHERE setting_key = ?`,
    )
    .bind(settingKey)
    .first<{
      setting_key: string;
      value: string;
      updated_at: string;
      updated_by: string | null;
    }>();
  if (!row) return null;
  return {
    settingKey: row.setting_key,
    value: row.value,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function upsertPromptSetting(
  db: AppDatabase,
  settingKey: string,
  value: string,
  updatedBy: string,
): Promise<KnPromptSettingPublic> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO knowledge_network_prompt_settings
         (setting_key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value = VALUES(value),
         updated_at = VALUES(updated_at),
         updated_by = VALUES(updated_by)`,
    )
    .bind(settingKey, value, now, updatedBy)
    .run();
  const saved = await getPromptSetting(db, settingKey);
  if (!saved) {
    throw new Error("写入 prompt setting 后读取失败");
  }
  return saved;
}
