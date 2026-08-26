import type { AppDatabase } from "./app-database";
import { isPlatformAdmin } from "./projects-auth";
import { skillToIntentsMap } from "./skill-intent-map";
import {
  assertSkillName,
  b64ToUtf8,
  byteLengthB64,
  defaultSkillMarkdown,
  deleteSkillFromDb,
  getSkillMdContent,
  getSkillMeta,
  listSkillFilePathsBySkill,
  listSkillFiles,
  listSkillsFromDb,
  normalizeDescription,
  normalizeIncomingFiles,
  setSkillSyncResult,
  titleFromSkillMd,
  utf8ToB64,
  updateSkillTextFiles,
  upsertSkillWithFiles,
} from "./skills-db";
import {
  hermesRestartConfigured,
  restartHermesGatewayDeployment,
} from "./hermes-k8s-restart";
import {
  callSkillsBridge,
  deleteSkillFromVolume,
  fetchVolumeSkillTree,
  listVolumeSkillNames,
  listVolumeSkills,
  pushSkillToVolume,
  skillsBridgeBase,
} from "./skills-volume-sync";
import { serializeChapterSkillMap } from "./chapter-skill-map";
import { recordOperationLog } from "./operation-logs-db";

type Env = {
  DB: AppDatabase;
  MYSQL_BRIDGE_URL?: string;
  MYSQL_BRIDGE_KEY?: string;
  SKILLS_BRIDGE_URL?: string;
  SKILLS_BRIDGE_KEY?: string;
  HERMES_K8S_NAMESPACE?: string;
  HERMES_K8S_DEPLOYMENT?: string;
  HERMES_RESTART_MODE?: string;
  HERMES_DOCKER_CONTAINER?: string;
  KUBERNETES_SERVICE_HOST?: string;
  KUBERNETES_SERVICE_PORT?: string;
  KUBERNETES_SERVICE_PORT_HTTPS?: string;
  JFO_NODE_HELPER_BASE?: string;
  JFO_INTERNAL_KEY?: string;
};

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

function statusOf(e: unknown): number {
  const s = (e as { status?: number })?.status;
  return typeof s === "number" ? s : 500;
}

export async function handleAdminListSkills(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  try {
    // 意图 ↔ skill 由代码 INTENT_TO_SKILL 固定（1 skill ↔ 路由意图），列表只读展示
    const intentBySkill = skillToIntentsMap();
    const rows = await listSkillsFromDb(env.DB);
    const filePathsBySkill = await listSkillFilePathsBySkill(env.DB);
    const byName = new Map(
      rows.map((r) => {
        const intents = intentBySkill[r.name] ?? [];
        return [
          r.name,
          {
            name: r.name,
            title: r.title || r.name,
            description: String(r.description ?? ""),
            fileCount: Number(r.file_count ?? 0),
            filePaths: filePathsBySkill.get(r.name) ?? [],
            syncStatus: r.sync_status as string,
            syncError: r.sync_error,
            syncedAt: r.synced_at,
            inDatabase: true,
            onVolume: false,
            intent: intents[0] ?? null,
            intents,
          },
        ] as const;
      }),
    );

    let volumeDir: string | null = null;
    let volumeWarning: string | null = null;
    const vol = await listVolumeSkills(env);
    if (vol.ok) {
      volumeDir = vol.sourceDir;
      for (const vs of vol.skills) {
        const existing = byName.get(vs.name);
        if (existing) {
          existing.onVolume = true;
          if (!existing.title || existing.title === existing.name) {
            existing.title = vs.title || existing.title;
          }
        } else {
          const intents = intentBySkill[vs.name] ?? [];
          byName.set(vs.name, {
            name: vs.name,
            title: vs.title || vs.name,
            description: "",
            fileCount: 0,
            filePaths: [],
            syncStatus: "not_in_db",
            syncError: null,
            syncedAt: null,
            inDatabase: false,
            onVolume: true,
            intent: intents[0] ?? null,
            intents,
          });
        }
      }
    } else if (skillsBridgeBase(env)) {
      volumeWarning = vol.error;
    }

    const skills = Array.from(byName.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return json({
      ok: true,
      sourceOfTruth: "mysql",
      bridgeConfigured: Boolean(skillsBridgeBase(env)),
      hermesRestartConfigured: hermesRestartConfigured(env),
      volumeDir,
      volumeWarning,
      skills,
      chapterSkillMap: serializeChapterSkillMap(),
    });
  } catch (e) {
    return json(
      {
        error: String((e as Error)?.message ?? e),
        hint: "若尚未建表，请执行 MySQL 迁移（0004_hermes_skills）。",
      },
      500,
    );
  }
}

/** 将单个卷上 skill 入库（覆盖同名） */
async function importOneSkillFromVolume(
  env: Env,
  name: string,
): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  const tree = await fetchVolumeSkillTree(env, name);
  if (!tree.ok) return { ok: false, error: tree.error };
  try {
    const filesNorm = normalizeIncomingFiles(
      tree.files.filter((f) => f.path && f.contentBase64),
    );
    await upsertSkillWithFiles(env.DB, name, tree.title || name, filesNorm);
    await setSkillSyncResult(env.DB, name, true);
    return { ok: true, title: tree.title || name };
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }
}

/** 全量：库 → 卷 */
export async function handleAdminSyncSkills(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const rows = await listSkillsFromDb(env.DB);
  let okCount = 0;
  const errors: Array<{ name: string; error: string }> = [];
  for (const row of rows) {
    const push = await pushSkillToVolume(env, row.name);
    if (push.ok) okCount += 1;
    else errors.push({ name: row.name, error: push.warning ?? "失败" });
  }
  return json({
    ok: errors.length === 0,
    copied: okCount,
    total: rows.length,
    errors,
    hint:
      errors.length === 0
        ? "已将库中全部 skill 同步到卷。需要时请在管理台重启 Hermes Gateway。"
        : `成功 ${okCount}/${rows.length}；失败 skill 见 errors。`,
  });
}

export async function handleAdminSyncOneSkill(
  env: Env,
  authUserId: string,
  skillName: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  let name: string;
  try {
    name = assertSkillName(skillName);
  } catch (e) {
    return json({ error: String((e as Error).message) }, statusOf(e));
  }
  let meta = await getSkillMeta(env.DB, name);
  if (!meta) {
    const imported = await importOneSkillFromVolume(env, name);
    if (!imported.ok) {
      return json({ error: imported.error || `找不到 skill：${name}` }, 404);
    }
    meta = await getSkillMeta(env.DB, name);
  }
  if (!meta) return json({ error: `找不到 skill：${name}` }, 404);
  const push = await pushSkillToVolume(env, name);
  return json({
    ok: push.ok,
    name,
    syncWarning: push.ok ? null : push.warning ?? "同步失败",
    hint: push.hint ?? null,
  });
}

export async function handleAdminGetSkill(
  env: Env,
  authUserId: string,
  skillName: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  let name: string;
  try {
    name = assertSkillName(skillName);
  } catch (e) {
    return json({ error: String((e as Error).message) }, statusOf(e));
  }
  let meta = await getSkillMeta(env.DB, name);
  if (!meta) {
    // 本地卷有、库没有：打开编辑时自动入库
    const imported = await importOneSkillFromVolume(env, name);
    if (!imported.ok) {
      return json(
        {
          error: imported.error || `找不到 skill：${name}`,
          hint: "本地卷无此 skill，且 MySQL 中未入库。可先「从卷导入」或 seed。",
        },
        404,
      );
    }
    meta = await getSkillMeta(env.DB, name);
    if (!meta) {
      return json({ error: `入库后仍找不到：${name}` }, 500);
    }
  }
  const content = (await getSkillMdContent(env.DB, name)) ?? "";
  const fileRows = await listSkillFiles(env.DB, name);
  const files = fileRows.map((row) => {
    const isText = Boolean(row.is_text);
    return {
      path: row.rel_path,
      byteSize: Number(row.byte_size ?? 0),
      isText,
      content: isText ? b64ToUtf8(row.content_b64) : null,
    };
  });
  return json({
    ok: true,
    name,
    title: meta.title || name,
    description: String(meta.description ?? ""),
    content,
    files,
    syncStatus: meta.sync_status,
    syncError: meta.sync_error,
    syncedAt: meta.synced_at,
  });
}

export async function handleAdminPutSkill(
  env: Env,
  authUserId: string,
  skillName: string,
  request: Request,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  let name: string;
  try {
    name = assertSkillName(skillName);
  } catch (e) {
    return json({ error: String((e as Error).message) }, statusOf(e));
  }

  let body: {
    content?: string;
    description?: string;
    files?: Array<{ path?: string; content?: string }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const fileUpdates = Array.isArray(body.files)
    ? body.files
        .filter(
          (f) =>
            typeof f?.path === "string" && typeof f?.content === "string",
        )
        .map((f) => ({ path: String(f.path), content: String(f.content) }))
    : [];
  if (fileUpdates.length === 0 && typeof body.content === "string") {
    fileUpdates.push({ path: "SKILL.md", content: body.content });
  }
  if (fileUpdates.length === 0 && typeof body.description !== "string") {
    return json({ error: "请提供要保存的文件或描述" }, 400);
  }

  try {
    await updateSkillTextFiles(env.DB, name, fileUpdates, {
      description:
        typeof body.description === "string" ? body.description : undefined,
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, statusOf(e));
  }

  const push = await pushSkillToVolume(env, name);
  await recordOperationLog(env.DB, {
    actorUserId: authUserId,
    category: "skill",
    action: "update",
    targetKind: "skill",
    targetId: name,
    targetLabel: name,
    summary: `更新 Skill ${name}`,
  });
  const meta = await getSkillMeta(env.DB, name);
  return json({
    ok: true,
    name,
    title: meta?.title ?? name,
    description: String(meta?.description ?? ""),
    syncWarning: push.ok ? null : push.warning ?? "同步到卷失败",
    hint:
      push.hint ??
      (push.ok ? "已写入库并同步到卷；需要时请重启 Hermes Gateway。" : null),
  });
}

export async function handleAdminRestartHermesGateway(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const result = await restartHermesGatewayDeployment(env);
  if (!result.ok) {
    return json(
      {
        ok: false,
        error: result.error,
        hint: result.hint ?? null,
      },
      result.httpStatus ?? 503,
    );
  }
  await recordOperationLog(env.DB, {
    actorUserId: authUserId,
    category: "skill",
    action: "restart_gateway",
    targetKind: "skill",
    targetId: "hermes-gateway",
    targetLabel: "Hermes Gateway",
    summary: "重启 Hermes Gateway",
  });
  return json({
    ok: true,
    namespace: result.namespace,
    deployment: result.deployment,
    restartedAt: result.restartedAt,
    hint:
      result.hint ??
      `已触发 ${result.namespace}/${result.deployment} 重启；进行中的 Hermes 任务可能中断。`,
  });
}

export async function handleAdminCreateSkill(
  env: Env,
  authUserId: string,
  request: Request,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  let body: {
    name?: string;
    title?: string;
    description?: string;
    content?: string;
    files?: Array<{ path: string; contentBase64: string; isText?: boolean }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  let name: string;
  try {
    name = assertSkillName(body.name ?? "");
  } catch (e) {
    return json({ error: String((e as Error).message) }, statusOf(e));
  }

  const description = normalizeDescription(body.description);
  try {
    let filesNorm;
    if (Array.isArray(body.files) && body.files.length > 0) {
      filesNorm = normalizeIncomingFiles(body.files);
    } else {
      const md =
        typeof body.content === "string" && body.content.length > 0
          ? body.content
          : defaultSkillMarkdown(name, body.title);
      const content_b64 = utf8ToB64(md);
      filesNorm = [
        {
          rel_path: "SKILL.md",
          content_b64,
          is_text: 1,
          byte_size: byteLengthB64(content_b64),
        },
      ];
    }
    const mdFile = filesNorm.find((f) => f.rel_path === "SKILL.md");
    const title = mdFile
      ? titleFromSkillMd(b64ToUtf8(mdFile.content_b64), name)
      : name;

    await upsertSkillWithFiles(env.DB, name, title, filesNorm, {
      createOnly: true,
      description,
    });
  } catch (e) {
    return json({ error: String((e as Error).message) }, statusOf(e));
  }

  const push = await pushSkillToVolume(env, name);
  await recordOperationLog(env.DB, {
    actorUserId: authUserId,
    category: "skill",
    action: "create",
    targetKind: "skill",
    targetId: name,
    targetLabel: name,
    summary: `新建 Skill ${name}`,
  });
  return json(
    {
      ok: true,
      name,
      description,
      syncWarning: push.ok ? null : push.warning ?? "同步到卷失败",
      hint: push.hint ?? null,
    },
    201,
  );
}

export async function handleAdminDeleteSkill(
  env: Env,
  authUserId: string,
  skillName: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  let name: string;
  try {
    name = assertSkillName(skillName);
  } catch (e) {
    return json({ error: String((e as Error).message) }, statusOf(e));
  }

  const removedDb = await deleteSkillFromDb(env.DB, name);
  const vol = await deleteSkillFromVolume(env, name);
  if (!removedDb && !vol.ok) {
    return json({ error: `找不到 skill：${name}` }, 404);
  }
  await recordOperationLog(env.DB, {
    actorUserId: authUserId,
    category: "skill",
    action: "delete",
    targetKind: "skill",
    targetId: name,
    targetLabel: name,
    summary: `删除 Skill ${name}`,
  });
  return json({
    ok: true,
    name,
    syncWarning: vol.ok ? null : vol.warning ?? "卷删除失败",
    hint: vol.ok
      ? "已删除（库与/或卷）。需要时请重启 Hermes Gateway。"
      : "已从库删除；卷侧删除失败，可稍后清理。",
  });
}

/** 从卷导入整树到库（覆盖同名），不自动再推回（库即权威，内容已一致） */
export async function handleAdminImportFromVolume(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  const listed = await listVolumeSkillNames(env);
  if (!listed.ok) {
    return json({ error: listed.error, code: "BRIDGE_ERROR" }, 503);
  }

  let imported = 0;
  const errors: Array<{ name: string; error: string }> = [];
  for (const name of listed.names) {
    try {
      const tree = await fetchVolumeSkillTree(env, name);
      if (!tree.ok) {
        errors.push({ name, error: tree.error });
        continue;
      }
      const filesNorm = normalizeIncomingFiles(
        tree.files.filter((f) => f.path && f.contentBase64),
      );
      await upsertSkillWithFiles(env.DB, name, tree.title || name, filesNorm);
      await setSkillSyncResult(env.DB, name, true);
      imported += 1;
    } catch (e) {
      errors.push({ name, error: String((e as Error).message) });
    }
  }

  return json({
    ok: errors.length === 0,
    imported,
    total: listed.names.length,
    errors,
    hint: `已从卷导入 ${imported} 个 skill 到 MySQL（同名覆盖）。`,
  });
}

/** 保留：探测 bridge（调试用） */
export async function handleAdminBridgeHealth(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  const result = await callSkillsBridge(env, "/healthz");
  if (!result.ok) {
    return json({ ok: false, error: result.error }, 503);
  }
  return json({ ok: true, bridge: result.data });
}
