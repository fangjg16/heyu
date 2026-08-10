import { apiFetch } from "@/lib/api-auth";
import {
  API_CATALOG,
  pathHasUnresolved,
  resolvePathTemplate,
  type ApiCatalogEntry,
} from "@/lib/admin-api-catalog";
import { loadSessionUserId } from "@/workspace/session";

export type ProbeResult = {
  id: string;
  method: string;
  path: string;
  ok: boolean;
  status: number;
  ms: number;
  summary: string;
  skipped?: boolean;
  skipReason?: string;
  bodyPreview?: string;
};

function withUserId(path: string): string {
  const userId = loadSessionUserId() ?? "";
  if (!userId) return path;
  const u = new URL(path, "http://local.invalid");
  if (!u.searchParams.has("userId")) {
    u.searchParams.set("userId", userId);
  }
  return `${u.pathname}${u.search}`;
}

export async function probeOne(
  entry: ApiCatalogEntry,
  vars: Record<string, string>,
  init?: { body?: string },
): Promise<ProbeResult> {
  const started = performance.now();
  let path = resolvePathTemplate(entry.pathTemplate, vars);
  if (pathHasUnresolved(path)) {
    return {
      id: entry.id,
      method: entry.method,
      path,
      ok: false,
      status: 0,
      ms: 0,
      skipped: true,
      skipReason: "缺少路径参数（请填写 projectId 等）",
      summary: "已跳过",
    };
  }
  path = withUserId(path);

  try {
    const res = await apiFetch(path, {
      method: entry.method,
      body:
        init?.body ??
        (entry.method === "GET" || entry.method === "DELETE"
          ? undefined
          : entry.sampleBody),
    });
    const ms = Math.round(performance.now() - started);
    const text = await res.text().catch(() => "");
    let summary = res.ok ? "OK" : text.slice(0, 160) || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string; ok?: boolean };
      if (j.error) summary = j.error;
      else if (res.ok) summary = "OK";
    } catch {
      /* plain text */
    }
    return {
      id: entry.id,
      method: entry.method,
      path,
      ok: res.ok,
      status: res.status,
      ms,
      summary,
      bodyPreview: text.slice(0, 4000),
    };
  } catch (e) {
    return {
      id: entry.id,
      method: entry.method,
      path,
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      summary: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 先拉项目列表解析一个 projectId，再跑 autoProbe 项 */
export async function runSafeProbeSuite(opts?: {
  projectId?: string;
  includeWrite?: boolean;
}): Promise<{ projectId: string | null; results: ProbeResult[] }> {
  const results: ProbeResult[] = [];
  let projectId = (opts?.projectId ?? "").trim() || null;

  // 先探测 projects 列表以拿到 projectId
  const listEntry = API_CATALOG.find((e) => e.id === "projects-list");
  if (listEntry) {
    const listRes = await probeOne(listEntry, {});
    results.push(listRes);
    if (!projectId) {
      try {
        const res = await apiFetch(withUserId("/api/projects"));
        if (res.ok) {
          const data = (await res.json()) as {
            projects?: Array<{ id?: string }>;
          };
          const first = (data.projects ?? []).find((p) => p.id)?.id;
          if (first) projectId = first;
        }
      } catch {
        /* ignore */
      }
    }
  }

  const vars: Record<string, string> = {
    projectId: projectId ?? "",
    sectionId: "snapshot",
    runId: "",
    docId: "",
  };

  for (const entry of API_CATALOG) {
    if (entry.id === "projects-list") continue;
    const allow =
      entry.autoProbe ||
      (opts?.includeWrite && entry.risk === "write");
    if (!allow) continue;
    if (entry.risk === "destructive" || entry.risk === "llm" || entry.risk === "internal") {
      continue;
    }
    if (entry.needsProject && !projectId) {
      results.push({
        id: entry.id,
        method: entry.method,
        path: entry.pathTemplate,
        ok: false,
        status: 0,
        ms: 0,
        skipped: true,
        skipReason: "无可用 projectId",
        summary: "已跳过",
      });
      continue;
    }
    results.push(await probeOne(entry, vars));
  }

  return { projectId, results };
}

export async function sendManualRequest(input: {
  method: string;
  path: string;
  body?: string;
}): Promise<ProbeResult> {
  const entry: ApiCatalogEntry = {
    id: "manual",
    group: "手动",
    method: input.method.toUpperCase() as ApiCatalogEntry["method"],
    pathTemplate: input.path.trim() || "/",
    summary: "手动请求",
    risk: "safe",
  };
  return probeOne(entry, {}, { body: input.body });
}
