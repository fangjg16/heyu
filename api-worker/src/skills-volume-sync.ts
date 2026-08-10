import type { AppDatabase } from "./app-database";
import { listSkillFiles, setSkillSyncResult } from "./skills-db";

type BridgeEnv = {
  MYSQL_BRIDGE_URL?: string;
  MYSQL_BRIDGE_KEY?: string;
  SKILLS_BRIDGE_URL?: string;
  SKILLS_BRIDGE_KEY?: string;
};

export function skillsBridgeBase(env: BridgeEnv): string | null {
  const preferred = (env.SKILLS_BRIDGE_URL ?? "").trim().replace(/\/+$/u, "");
  if (preferred) return preferred;
  const fallback = (env.MYSQL_BRIDGE_URL ?? "").trim().replace(/\/+$/u, "");
  return fallback || null;
}

function skillsBridgeKey(env: BridgeEnv): string {
  const preferred = (env.SKILLS_BRIDGE_KEY ?? "").trim();
  if (preferred) return preferred;
  return (env.MYSQL_BRIDGE_KEY ?? "").trim();
}

export async function callSkillsBridge(
  env: BridgeEnv,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; status: number; data: Record<string, unknown> } | { ok: false; error: string; status: number }> {
  const base = skillsBridgeBase(env);
  if (!base) {
    return {
      ok: false,
      status: 503,
      error:
        "未配置 Skills Bridge。生产请设置 SKILLS_BRIDGE_URL；本地请用 npm run dev:local（回退 MYSQL_BRIDGE_URL）。",
    };
  }
  const headers = new Headers(init.headers);
  const key = skillsBridgeKey(env);
  if (key) headers.set("Authorization", `Bearer ${key}`);
  try {
    const res = await fetch(`${base}${path}`, { ...init, headers });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (data.error as string) || `Bridge 请求失败（${res.status}）`,
      };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return {
      ok: false,
      status: 503,
      error: `无法连接 Skills Bridge（${base}）：${String((e as Error)?.message ?? e)}`,
    };
  }
}

/** 将库中某一 skill 整树覆盖推到卷 */
export async function pushSkillToVolume(
  env: BridgeEnv & { DB: AppDatabase },
  skillName: string,
): Promise<{ ok: boolean; warning?: string; hint?: string | null }> {
  const files = await listSkillFiles(env.DB, skillName);
  if (files.length === 0) {
    const msg = "库中无文件，无法同步";
    await setSkillSyncResult(env.DB, skillName, false, msg);
    return { ok: false, warning: msg };
  }
  const payload = {
    files: files.map((f) => ({
      path: f.rel_path,
      contentBase64: f.content_b64,
      isText: Boolean(f.is_text),
    })),
  };
  const result = await callSkillsBridge(
    env,
    `/v1/skills/${encodeURIComponent(skillName)}/tree`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!result.ok) {
    await setSkillSyncResult(env.DB, skillName, false, result.error);
    return { ok: false, warning: result.error };
  }
  await setSkillSyncResult(env.DB, skillName, true);
  return {
    ok: true,
    hint: (result.data.hint as string) ?? null,
  };
}

export async function deleteSkillFromVolume(
  env: BridgeEnv,
  skillName: string,
): Promise<{ ok: boolean; warning?: string }> {
  const result = await callSkillsBridge(
    env,
    `/v1/skills/${encodeURIComponent(skillName)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeInstalled: true }),
    },
  );
  if (!result.ok) {
    // 卷上本就不存在时视为成功
    if (result.status === 404) return { ok: true };
    return { ok: false, warning: result.error };
  }
  return { ok: true };
}

export async function fetchVolumeSkillTree(
  env: BridgeEnv,
  skillName: string,
): Promise<
  | { ok: true; files: Array<{ path: string; contentBase64: string; isText?: boolean }>; title: string }
  | { ok: false; error: string }
> {
  const result = await callSkillsBridge(
    env,
    `/v1/skills/${encodeURIComponent(skillName)}/tree`,
  );
  if (!result.ok) return { ok: false, error: result.error };
  const files = Array.isArray(result.data.files) ? result.data.files : [];
  return {
    ok: true,
    title: String(result.data.title ?? skillName),
    files: files.map((f) => {
      const row = f as {
        path?: string;
        contentBase64?: string;
        isText?: boolean;
      };
      return {
        path: String(row.path ?? ""),
        contentBase64: String(row.contentBase64 ?? ""),
        isText: row.isText,
      };
    }),
  };
}

export type VolumeSkillSummary = {
  name: string;
  title: string;
  installed: boolean;
};

export async function listVolumeSkills(
  env: BridgeEnv,
): Promise<
  | { ok: true; skills: VolumeSkillSummary[]; sourceDir: string | null }
  | { ok: false; error: string }
> {
  const result = await callSkillsBridge(env, "/v1/skills");
  if (!result.ok) return { ok: false, error: result.error };
  const raw = Array.isArray(result.data.skills) ? result.data.skills : [];
  const skills = raw
    .map((s) => {
      const row = s as {
        name?: string;
        title?: string;
        installed?: boolean;
      };
      const name = String(row.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        title: String(row.title ?? name),
        installed: Boolean(row.installed),
      };
    })
    .filter((x): x is VolumeSkillSummary => Boolean(x));
  return {
    ok: true,
    skills,
    sourceDir:
      typeof result.data.sourceDir === "string" ? result.data.sourceDir : null,
  };
}

export async function listVolumeSkillNames(
  env: BridgeEnv,
): Promise<{ ok: true; names: string[] } | { ok: false; error: string }> {
  const listed = await listVolumeSkills(env);
  if (!listed.ok) return listed;
  return { ok: true, names: listed.skills.map((s) => s.name) };
}
