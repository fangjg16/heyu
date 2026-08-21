import { apiFetch } from "@/lib/api-auth";

export type SkillSyncStatus = "pending" | "ok" | "error" | "not_in_db";

export type AdminSkillRow = {
  name: string;
  title: string;
  /** 作用简述（管理展示） */
  description: string;
  fileCount: number;
  filePaths: string[];
  syncStatus: SkillSyncStatus;
  syncError: string | null;
  syncedAt: string | null;
  inDatabase: boolean;
  onVolume: boolean;
  /** 每个 skill 至多一个 */
  intent: string | null;
  /** 兼容展示：0 或 1 个元素 */
  intents: string[];
};

export type ChapterSkillSpecDto = {
  primary: string[];
  borrow: string[];
};

export type ChapterSkillMapDto = {
  kinds: { id: string; label: string }[];
  sections: { id: string; label: string }[];
  cells: Record<string, Record<string, ChapterSkillSpecDto>>;
};

export type AdminSkillsList = {
  sourceOfTruth: "mysql";
  bridgeConfigured: boolean;
  /** ACK 上配置了 HERMES_K8S_* 且位于集群内时可一键重启 */
  hermesRestartConfigured: boolean;
  volumeDir: string | null;
  volumeWarning: string | null;
  skills: AdminSkillRow[];
  chapterSkillMap: ChapterSkillMapDto | null;
};

export type AdminSkillsSyncResult = {
  ok: boolean;
  copied: number;
  total: number;
  errors: Array<{ name: string; error: string }>;
  hint: string | null;
};

async function readError(res: Response): Promise<string> {
  if (res.status === 404) {
    return "Skills 管理接口不存在（404）。请重新 build:production 并部署 / 重启 API Worker。";
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    hint?: string;
  };
  const base = data.error || `请求失败（${res.status}）`;
  return data.hint ? `${base}（${data.hint}）` : base;
}

export async function fetchAdminSkills(): Promise<AdminSkillsList> {
  const res = await apiFetch("/api/admin/skills");
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    skills?: Array<{
      name?: string;
      title?: string;
      description?: string;
      fileCount?: number;
      filePaths?: string[];
      syncStatus?: string;
      syncError?: string | null;
      syncedAt?: string | null;
      inDatabase?: boolean;
      onVolume?: boolean;
      intent?: string | null;
      intents?: string[];
    }>;
    bridgeConfigured?: boolean;
    hermesRestartConfigured?: boolean;
    volumeDir?: string | null;
    volumeWarning?: string | null;
    chapterSkillMap?: ChapterSkillMapDto | null;
  };
  const rawMap = data.chapterSkillMap;
  const chapterSkillMap: ChapterSkillMapDto | null =
    rawMap &&
    Array.isArray(rawMap.kinds) &&
    Array.isArray(rawMap.sections) &&
    rawMap.cells &&
    typeof rawMap.cells === "object"
      ? {
          kinds: rawMap.kinds.map((k) => ({
            id: String(k.id ?? ""),
            label: String(k.label ?? k.id ?? ""),
          })),
          sections: rawMap.sections.map((s) => ({
            id: String(s.id ?? ""),
            label: String(s.label ?? s.id ?? ""),
          })),
          cells: rawMap.cells,
        }
      : null;
  return {
    sourceOfTruth: "mysql",
    bridgeConfigured: Boolean(data.bridgeConfigured),
    hermesRestartConfigured: Boolean(data.hermesRestartConfigured),
    volumeDir: data.volumeDir ?? null,
    volumeWarning: data.volumeWarning ?? null,
    chapterSkillMap,
    skills: (data.skills ?? []).map((s) => {
      const intent =
        (typeof s.intent === "string" && s.intent) ||
        (Array.isArray(s.intents) && s.intents[0]) ||
        null;
      return {
        name: String(s.name ?? ""),
        title: String(s.title ?? s.name ?? ""),
        description: String(s.description ?? ""),
        fileCount: Number(s.fileCount ?? 0),
        filePaths: Array.isArray(s.filePaths)
          ? s.filePaths.map((p) => String(p)).filter(Boolean)
          : [],
        syncStatus: (s.syncStatus as SkillSyncStatus) || "pending",
        syncError: s.syncError ?? null,
        syncedAt: s.syncedAt ?? null,
        inDatabase: s.inDatabase !== false && s.syncStatus !== "not_in_db",
        onVolume: Boolean(s.onVolume),
        intent,
        intents: intent ? [intent] : [],
      };
    }),
  };
}

export async function syncAllAdminSkills(): Promise<AdminSkillsSyncResult> {
  const res = await apiFetch("/api/admin/skills/sync", { method: "POST" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as Partial<AdminSkillsSyncResult>;
  return {
    ok: Boolean(data.ok),
    copied: Number(data.copied ?? 0),
    total: Number(data.total ?? 0),
    errors: Array.isArray(data.errors) ? data.errors : [],
    hint: data.hint ?? null,
  };
}

/** @deprecated 使用 syncAllAdminSkills */
export const syncAdminSkills = syncAllAdminSkills;

export async function syncOneAdminSkill(
  skillName: string,
): Promise<{ ok: boolean; syncWarning: string | null; hint: string | null }> {
  const res = await apiFetch(
    `/api/admin/skills/${encodeURIComponent(skillName)}/sync`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    ok?: boolean;
    syncWarning?: string | null;
    hint?: string | null;
  };
  return {
    ok: Boolean(data.ok),
    syncWarning: data.syncWarning ?? null,
    hint: data.hint ?? null,
  };
}

export async function importSkillsFromVolume(): Promise<{
  ok: boolean;
  imported: number;
  total: number;
  hint: string | null;
  errors: Array<{ name: string; error: string }>;
}> {
  const res = await apiFetch("/api/admin/skills/import-from-volume", {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    ok?: boolean;
    imported?: number;
    total?: number;
    hint?: string | null;
    errors?: Array<{ name: string; error: string }>;
  };
  return {
    ok: Boolean(data.ok),
    imported: Number(data.imported ?? 0),
    total: Number(data.total ?? 0),
    hint: data.hint ?? null,
    errors: Array.isArray(data.errors) ? data.errors : [],
  };
}

export type AdminSkillFile = {
  path: string;
  byteSize: number;
  isText: boolean;
  content: string | null;
};

export type AdminSkillContent = {
  name: string;
  title: string;
  description: string;
  content: string;
  files: AdminSkillFile[];
  syncStatus: SkillSyncStatus;
  syncError: string | null;
  syncedAt: string | null;
};

export async function fetchAdminSkillContent(
  skillName: string,
): Promise<AdminSkillContent> {
  const res = await apiFetch(
    `/api/admin/skills/${encodeURIComponent(skillName)}`,
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as Partial<AdminSkillContent> & {
    files?: Array<{
      path?: string;
      byteSize?: number;
      isText?: boolean;
      content?: string | null;
    }>;
  };
  return {
    name: String(data.name ?? skillName),
    title: String(data.title ?? skillName),
    description: String(data.description ?? ""),
    content: typeof data.content === "string" ? data.content : "",
    files: (data.files ?? []).map((f) => ({
      path: String(f.path ?? ""),
      byteSize: Number(f.byteSize ?? 0),
      isText: Boolean(f.isText),
      content: typeof f.content === "string" ? f.content : null,
    })),
    syncStatus: (data.syncStatus as SkillSyncStatus) || "pending",
    syncError: data.syncError ?? null,
    syncedAt: data.syncedAt ?? null,
  };
}

export async function saveAdminSkillContent(
  skillName: string,
  input: {
    description?: string;
    content?: string;
    files?: Array<{ path: string; content: string }>;
  },
): Promise<{
  name: string;
  title: string;
  description: string;
  syncWarning: string | null;
  hint: string | null;
}> {
  const res = await apiFetch(
    `/api/admin/skills/${encodeURIComponent(skillName)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    name?: string;
    title?: string;
    description?: string;
    syncWarning?: string | null;
    hint?: string | null;
  };
  return {
    name: String(data.name ?? skillName),
    title: String(data.title ?? skillName),
    description: String(data.description ?? input.description ?? ""),
    syncWarning: data.syncWarning ?? null,
    hint: data.hint ?? null,
  };
}

export async function createAdminSkill(input: {
  name: string;
  title?: string;
  description?: string;
  content?: string;
}): Promise<{
  name: string;
  syncWarning: string | null;
  hint: string | null;
}> {
  const res = await apiFetch("/api/admin/skills", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      title: input.title,
      description: input.description,
      content: input.content,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    name?: string;
    syncWarning?: string | null;
    hint?: string | null;
  };
  return {
    name: String(data.name ?? input.name),
    syncWarning: data.syncWarning ?? null,
    hint: data.hint ?? null,
  };
}

export async function restartHermesGateway(): Promise<{
  ok: boolean;
  hint: string | null;
  namespace?: string;
  deployment?: string;
  restartedAt?: string;
}> {
  const res = await apiFetch("/api/admin/skills/restart-gateway", {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    ok?: boolean;
    hint?: string | null;
    namespace?: string;
    deployment?: string;
    restartedAt?: string;
  };
  return {
    ok: Boolean(data.ok),
    hint: data.hint ?? null,
    namespace: data.namespace,
    deployment: data.deployment,
    restartedAt: data.restartedAt,
  };
}

export async function deleteAdminSkill(
  skillName: string,
): Promise<{ name: string; syncWarning: string | null; hint: string | null }> {
  const res = await apiFetch(
    `/api/admin/skills/${encodeURIComponent(skillName)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    name?: string;
    syncWarning?: string | null;
    hint?: string | null;
  };
  return {
    name: String(data.name ?? skillName),
    syncWarning: data.syncWarning ?? null,
    hint: data.hint ?? null,
  };
}

