import { useMemo, useState } from "react";
import { Activity, Loader2, Play, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  API_CATALOG,
  API_RISK_LABEL,
  type ApiCatalogEntry,
  type ApiRisk,
} from "@/lib/admin-api-catalog";
import {
  probeOne,
  runSafeProbeSuite,
  sendManualRequest,
  type ProbeResult,
} from "@/lib/admin-api-probe";

const RISK_CLASS: Record<ApiRisk, string> = {
  safe: "bg-[rgba(47,107,79,0.12)] text-[#2F6B4F]",
  write: "bg-[rgba(176,125,31,0.12)] text-[#8A6218]",
  destructive: "bg-[rgba(160,99,88,0.12)] text-[#A06358]",
  llm: "bg-[rgba(160,99,88,0.1)] text-[#722F37]",
  internal: "bg-[rgba(78,66,57,0.1)] text-[#59625F]",
};

export function AdminApiProbeSection() {
  const [projectId, setProjectId] = useState("");
  const [running, setRunning] = useState(false);
  const [includeWrite, setIncludeWrite] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(API_CATALOG[0]?.id ?? "");

  const [manualMethod, setManualMethod] = useState("GET");
  const [manualPath, setManualPath] = useState("/api/health");
  const [manualBody, setManualBody] = useState("");
  const [manualResult, setManualResult] = useState<ProbeResult | null>(null);
  const [manualBusy, setManualBusy] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, ApiCatalogEntry[]>();
    for (const e of API_CATALOG) {
      const list = map.get(e.group) ?? [];
      list.push(e);
      map.set(e.group, list);
    }
    return Array.from(map.entries());
  }, []);

  const selected = API_CATALOG.find((e) => e.id === selectedId) ?? null;
  const resultById = useMemo(() => {
    const m = new Map<string, ProbeResult>();
    for (const r of results) m.set(r.id, r);
    return m;
  }, [results]);

  const stats = useMemo(() => {
    const ran = results.filter((r) => !r.skipped);
    const ok = ran.filter((r) => r.ok).length;
    const fail = ran.filter((r) => !r.ok).length;
    const skip = results.filter((r) => r.skipped).length;
    return { ok, fail, skip, total: results.length };
  }, [results]);

  const onRunSafe = async () => {
    if (includeWrite) {
      if (
        !window.confirm(
          "将额外探测部分「写入」类接口（不含删除/发布/LLM）。确定继续？",
        )
      ) {
        return;
      }
    }
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const { projectId: resolved, results: rows } = await runSafeProbeSuite({
        projectId: projectId.trim() || undefined,
        includeWrite,
      });
      if (resolved && !projectId.trim()) setProjectId(resolved);
      setResults(rows);
      const fail = rows.filter((r) => !r.skipped && !r.ok).length;
      setNotice(
        fail === 0
          ? `探测完成：全部通过（共 ${rows.length} 项）`
          : `探测完成：${fail} 项失败（共 ${rows.length} 项）`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "探测失败");
    } finally {
      setRunning(false);
    }
  };

  const onProbeSelected = async () => {
    if (!selected) return;
    if (
      selected.risk === "destructive" ||
      selected.risk === "llm" ||
      selected.risk === "internal"
    ) {
      if (
        !window.confirm(
          `「${selected.summary}」风险为 ${API_RISK_LABEL[selected.risk]}，可能产生副作用或费用。确定单独探测？`,
        )
      ) {
        return;
      }
    }
    setRunning(true);
    setError(null);
    try {
      const vars = {
        projectId: projectId.trim(),
        sectionId: "project-summary",
        runId: "",
        docId: "",
      };
      const r = await probeOne(selected, vars);
      setResults((prev) => {
        const next = prev.filter((x) => x.id !== r.id);
        next.push(r);
        return next;
      });
      setManualPath(r.path);
      setManualMethod(selected.method);
      if (selected.sampleBody) setManualBody(selected.sampleBody);
      setManualResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "探测失败");
    } finally {
      setRunning(false);
    }
  };

  const onManualSend = async () => {
    setManualBusy(true);
    setError(null);
    try {
      const r = await sendManualRequest({
        method: manualMethod,
        path: manualPath,
        body:
          manualMethod === "GET" || manualMethod === "DELETE"
            ? undefined
            : manualBody || undefined,
      });
      setManualResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[18px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgba(78,66,57,0.1)] px-5 py-4">
        <div className="flex items-start gap-2">
          <Activity className="mt-0.5 h-4 w-4 text-[#A06358]" strokeWidth={2} />
          <div>
            <h2 className="text-[15px] font-semibold text-[#1F2423]">
              API 测试
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#59625F]">
              默认一键探测安全/只读接口；删除、发布、LLM、内部密钥接口需单独确认。使用当前登录 Bearer。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="projectId（可空，自动取列表首项）"
            className="h-9 min-w-[220px] rounded-lg border border-[rgba(78,66,57,0.14)] bg-white/80 px-3 text-[12.5px] outline-none focus:border-[rgba(160,99,88,0.35)]"
          />
          <label className="inline-flex items-center gap-1.5 text-[12px] text-[#59625F]">
            <input
              type="checkbox"
              checked={includeWrite}
              onChange={(e) => setIncludeWrite(e.target.checked)}
            />
            含写入类
          </label>
          <button
            type="button"
            onClick={() => void onRunSafe()}
            disabled={running}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#A06358] px-3.5 text-[12.5px] font-medium text-white hover:bg-[#8F564C] disabled:opacity-45"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            一键安全探测
          </button>
        </div>
      </div>

      {error ? (
        <p className="mx-5 mt-4 rounded-xl border border-[rgba(160,99,88,0.25)] bg-[rgba(160,99,88,0.06)] px-3.5 py-2 text-[12.5px] text-[#A06358]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mx-5 mt-4 rounded-xl border border-[rgba(94,155,117,0.28)] bg-[rgba(94,155,117,0.08)] px-3.5 py-2 text-[12.5px] text-[#2F6B4F]">
          {notice}
          {results.length > 0
            ? ` · 通过 ${stats.ok} / 失败 ${stats.fail} / 跳过 ${stats.skip}`
            : ""}
        </p>
      ) : null}

      <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="max-h-[min(72vh,820px)] overflow-auto border-b border-[rgba(78,66,57,0.1)] p-2 text-left lg:border-b-0 lg:border-r">
          {groups.map(([group, items]) => (
            <div key={group} className="mb-2">
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#969E9A]">
                {group}
              </div>
              <ul className="space-y-0.5 pl-1">
                {items.map((e) => {
                  const r = resultById.get(e.id);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(e.id);
                          setManualMethod(e.method);
                          setManualPath(
                            e.pathTemplate.replace(
                              ":projectId",
                              projectId.trim() || ":projectId",
                            ),
                          );
                          setManualBody(e.sampleBody ?? "");
                        }}
                        className={cn(
                          "flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors",
                          selectedId === e.id
                            ? "bg-[#EFE7E6] text-[#A06358]"
                            : "text-[#1F2423] hover:bg-[rgba(78,66,57,0.05)]",
                        )}
                      >
                        <span className="flex w-full items-center justify-start gap-1.5 text-[12px] font-medium">
                          <span className="font-mono text-[10.5px] text-[#969E9A]">
                            {e.method}
                          </span>
                          <span className="truncate">{e.summary}</span>
                        </span>
                        <span className="mt-1 flex w-full flex-wrap items-center justify-start gap-1">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              RISK_CLASS[e.risk],
                            )}
                          >
                            {API_RISK_LABEL[e.risk]}
                          </span>
                          {e.autoProbe ? (
                            <span className="rounded bg-[rgba(78,66,57,0.06)] px-1.5 py-0.5 text-[10px] text-[#969E9A]">
                              默认探测
                            </span>
                          ) : null}
                          {r ? (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                r.skipped
                                  ? "bg-[rgba(78,66,57,0.08)] text-[#969E9A]"
                                  : r.ok
                                    ? "bg-[rgba(47,107,79,0.12)] text-[#2F6B4F]"
                                    : "bg-[rgba(160,99,88,0.12)] text-[#A06358]",
                              )}
                            >
                              {r.skipped
                                ? "跳过"
                                : r.ok
                                  ? `${r.status} · ${r.ms}ms`
                                  : `${r.status || "ERR"}`}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <div className="min-w-0 space-y-4 p-4">
          {selected ? (
            <div className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[14px] font-semibold text-[#1F2423]">
                    {selected.summary}
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-[#59625F]">
                    {selected.method} {selected.pathTemplate}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onProbeSelected()}
                  disabled={running}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgba(160,99,88,0.3)] px-3 text-[12px] font-medium text-[#A06358] hover:bg-[#EFE7E6] disabled:opacity-45"
                >
                  <Play className="h-3.5 w-3.5" />
                  探测本条
                </button>
              </div>
              {resultById.get(selected.id) ? (
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-[rgba(78,66,57,0.04)] p-3 font-mono text-[11.5px] leading-relaxed text-[#1F2423]">
                  {JSON.stringify(resultById.get(selected.id), null, 2)}
                </pre>
              ) : (
                <p className="mt-3 text-[12.5px] text-[#969E9A]">
                  尚未探测。可点「探测本条」或「一键安全探测」。
                </p>
              )}
            </div>
          ) : null}

          <div className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 p-4">
            <div className="text-[13px] font-semibold text-[#1F2423]">
              单条调试
            </div>
            <p className="mt-1 text-[12px] text-[#969E9A]">
              手动指定方法与路径，用当前登录态发送请求。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={manualMethod}
                onChange={(e) => setManualMethod(e.target.value)}
                className="h-9 rounded-lg border border-[rgba(78,66,57,0.14)] bg-white px-2 text-[12.5px]"
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                className="h-9 min-w-[240px] flex-1 rounded-lg border border-[rgba(78,66,57,0.14)] bg-white px-3 font-mono text-[12.5px] outline-none focus:border-[rgba(160,99,88,0.35)]"
                placeholder="/api/..."
              />
              <button
                type="button"
                onClick={() => void onManualSend()}
                disabled={manualBusy || !manualPath.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1F2423] px-3.5 text-[12.5px] font-medium text-white disabled:opacity-45"
              >
                {manualBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                发送
              </button>
            </div>
            {manualMethod !== "GET" && manualMethod !== "DELETE" ? (
              <textarea
                value={manualBody}
                onChange={(e) => setManualBody(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder="JSON body（可选）"
                className="mt-2 w-full resize-y rounded-xl border border-[rgba(78,66,57,0.12)] bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-[rgba(160,99,88,0.35)]"
              />
            ) : null}
            {manualResult ? (
              <pre className="mt-3 max-h-[min(40vh,420px)] overflow-auto rounded-lg bg-[rgba(78,66,57,0.04)] p-3 font-mono text-[11.5px] leading-relaxed text-[#1F2423]">
                {manualResult.bodyPreview ||
                  JSON.stringify(manualResult, null, 2)}
              </pre>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="rounded-xl border border-[rgba(78,66,57,0.1)] bg-white/70 p-4">
              <div className="text-[13px] font-semibold text-[#1F2423]">
                最近探测结果
              </div>
              <div className="mt-2 overflow-auto">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[rgba(78,66,57,0.1)] text-[#969E9A]">
                      <th className="px-2 py-1.5 font-medium">方法</th>
                      <th className="px-2 py-1.5 font-medium">路径</th>
                      <th className="px-2 py-1.5 font-medium">状态</th>
                      <th className="px-2 py-1.5 font-medium">耗时</th>
                      <th className="px-2 py-1.5 font-medium">摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={`${r.id}-${r.path}`}
                        className="border-b border-[rgba(78,66,57,0.06)]"
                      >
                        <td className="px-2 py-1.5 font-mono text-[11px]">
                          {r.method}
                        </td>
                        <td className="max-w-[280px] truncate px-2 py-1.5 font-mono text-[11px]">
                          {r.path}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.skipped
                            ? "跳过"
                            : r.ok
                              ? r.status
                              : r.status || "ERR"}
                        </td>
                        <td className="px-2 py-1.5">{r.ms}ms</td>
                        <td className="max-w-[240px] truncate px-2 py-1.5 text-[#59625F]">
                          {r.skipReason || r.summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
