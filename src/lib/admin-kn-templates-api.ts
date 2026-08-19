import { apiFetch } from "@/lib/api-auth";
import { skillsForChapter } from "@/lib/chapter-skill-map";

export type KnChapterTemplate = {
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
  /** 生成时注入的 Hermes skill，不写入 MD */
  skills: string[];
};

export type GenerateSystemPrompt = {
  settingKey: string;
  value: string;
  updatedAt: string | null;
  updatedBy: string | null;
  empty: boolean;
};

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    hint?: string;
  };
  const base = data.error || `请求失败（${res.status}）`;
  return data.hint ? `${base}（${data.hint}）` : base;
}

function mapTemplate(raw: Record<string, unknown>): KnChapterTemplate {
  return {
    id: String(raw.id ?? ""),
    groupId: String(raw.groupId ?? ""),
    groupLabel: String(raw.groupLabel ?? ""),
    title: String(raw.title ?? ""),
    kicker: typeof raw.kicker === "string" ? raw.kicker : null,
    canonicalHint:
      typeof raw.canonicalHint === "string" ? raw.canonicalHint : null,
    markdown: String(raw.markdown ?? ""),
    formatHint: typeof raw.formatHint === "string" ? raw.formatHint : null,
    sortOrder: Number(raw.sortOrder) || 0,
    updatedAt: String(raw.updatedAt ?? ""),
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null,
    skills: Array.isArray(raw.skills)
      ? raw.skills.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : skillsForChapter(String(raw.id ?? "")),
  };
}

export async function listKnChapterTemplates(): Promise<KnChapterTemplate[]> {
  const res = await apiFetch("/api/admin/knowledge-network-chapter-templates");
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { templates?: unknown[] };
  const rows = Array.isArray(data.templates) ? data.templates : [];
  return rows
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map(mapTemplate)
    .filter((t) => t.id);
}

export async function getKnChapterTemplate(
  id: string,
): Promise<KnChapterTemplate> {
  const res = await apiFetch(
    `/api/admin/knowledge-network-chapter-templates/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template?: Record<string, unknown> };
  if (!data.template) throw new Error("模板不存在");
  return mapTemplate(data.template);
}

export async function saveKnChapterTemplate(
  id: string,
  input: { markdown?: string; formatHint?: string | null },
): Promise<KnChapterTemplate> {
  const res = await apiFetch(
    `/api/admin/knowledge-network-chapter-templates/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template?: Record<string, unknown> };
  if (!data.template) throw new Error("保存成功但未返回模板");
  return mapTemplate(data.template);
}

export async function reviseKnChapterTemplate(
  id: string,
  instruction: string,
): Promise<KnChapterTemplate> {
  const res = await apiFetch(
    `/api/admin/knowledge-network-chapter-templates/${encodeURIComponent(id)}/revise`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template?: Record<string, unknown> };
  if (!data.template) throw new Error("改写成功但未返回模板");
  return mapTemplate(data.template);
}

export async function getGenerateSystemPrompt(): Promise<GenerateSystemPrompt> {
  const res = await apiFetch(
    "/api/admin/knowledge-network-prompt-settings/generate_system",
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    settingKey?: string;
    value?: string;
    updatedAt?: string | null;
    updatedBy?: string | null;
    empty?: boolean;
  };
  return {
    settingKey: data.settingKey ?? "generate_system",
    value: data.value ?? "",
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
    empty: Boolean(data.empty),
  };
}

export async function saveGenerateSystemPrompt(
  value: string,
): Promise<GenerateSystemPrompt> {
  const res = await apiFetch(
    "/api/admin/knowledge-network-prompt-settings/generate_system",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    setting?: {
      settingKey?: string;
      value?: string;
      updatedAt?: string;
      updatedBy?: string | null;
    };
  };
  const s = data.setting;
  if (!s?.value) throw new Error("保存成功但未返回设置");
  return {
    settingKey: s.settingKey ?? "generate_system",
    value: s.value,
    updatedAt: s.updatedAt ?? null,
    updatedBy: s.updatedBy ?? null,
    empty: !s.value.trim(),
  };
}
