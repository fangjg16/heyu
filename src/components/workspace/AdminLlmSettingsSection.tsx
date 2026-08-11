import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchLlmSettings,
  refreshLlmModels,
  saveLlmSettings,
  testLlmSettings,
  type LlmSettings,
} from "@/lib/admin-llm-settings-api";

function formatModelsUpdatedAt(iso: string | null): string {
  if (!iso) return "尚未同步";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Date(t).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

export function AdminLlmSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<LlmSettings | null>(null);

  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [refreshModelsBusy, setRefreshModelsBusy] = useState(false);

  const busy = saveBusy || testBusy || refreshModelsBusy;

  const modelOptions = useMemo(() => {
    const list = [...(settings?.presets ?? [])];
    if (model && !list.includes(model)) list.unshift(model);
    return list;
  }, [settings?.presets, model]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    if (model.trim() !== settings.model.trim()) return true;
    if (apiKey.trim()) return true;
    return false;
  }, [settings, model, apiKey]);

  const applySettings = (s: LlmSettings) => {
    setSettings(s);
    setModel(s.model || s.presets[0] || "qwen-plus");
    setApiKey("");
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchLlmSettings();
      applySettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSave = async () => {
    setSaveBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveLlmSettings({
        model,
        apiKey: apiKey.trim() || undefined,
      });
      const next = await fetchLlmSettings();
      applySettings(next);
      setNotice(
        saved.apiKeyHint
          ? `已保存（密钥 ${saved.apiKeyHint}）`
          : "已保存",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaveBusy(false);
    }
  };

  const onTest = async () => {
    setTestBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (dirty) {
        setNotice("有未保存修改，当前测试的是已生效配置。");
      }
      const result = await testLlmSettings();
      if (!result.ok) {
        setError(result.error || "连通性测试失败");
        return;
      }
      setNotice(
        `连通成功 · ${result.model ?? model} · ${result.latencyMs ?? "—"}ms` +
          (result.preview ? ` · 回复「${result.preview}」` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "测试失败");
    } finally {
      setTestBusy(false);
    }
  };

  const onRefreshModels = async () => {
    setRefreshModelsBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!settings?.apiKeyConfigured && !apiKey.trim()) {
        setError("请先保存 API Key，再刷新模型列表");
        return;
      }
      // 若输入框有新 Key 但未保存，先提示保存
      if (apiKey.trim()) {
        setError("请先点击「保存」写入 API Key，再刷新模型列表");
        return;
      }
      const result = await refreshLlmModels();
      if (result.presets.length > 0 && settings) {
        applySettings({
          ...settings,
          presets: result.presets,
          modelsUpdatedAt: result.modelsUpdatedAt,
          modelsSource: result.modelsSource,
          modelsError: result.modelsError,
        });
        if (model && !result.presets.includes(model)) {
          setModel(result.presets[0] ?? model);
        }
      }
      if (!result.ok) {
        setError(result.error || result.modelsError || "刷新模型列表失败");
        return;
      }
      setNotice(
        `已从 DashScope 更新模型列表（${result.presets.length} 个）`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "刷新模型列表失败");
    } finally {
      setRefreshModelsBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center gap-2 text-[13px] text-[#969E9A]">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载模型配置…
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.82)] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1F2423]">
            <KeyRound className="h-4 w-4 text-[#CA2137]" />
            模型与密钥
          </div>
          <p className="mt-1.5 max-w-[640px] text-[12.5px] leading-relaxed text-[#59625F]">
            选择大模型并填写 API Key。模型列表可从 DashScope
            同步；超过 24 小时打开本页会自动刷新。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[rgba(78,66,57,0.14)] bg-transparent px-3 text-[12.5px] font-medium text-[#59625F] hover:bg-[rgba(78,66,57,0.05)] disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          刷新
        </button>
      </div>

      <div className="mt-5 grid max-w-xl gap-4">
        <label className="block">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-[#59625F]">模型</span>
            <button
              type="button"
              onClick={() => void onRefreshModels()}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#CA2137] hover:underline disabled:opacity-50"
            >
              {refreshModelsBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              刷新模型列表
            </button>
          </div>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={busy || modelOptions.length === 0}
            className="mt-1.5 h-10 w-full rounded-[10px] border border-[rgba(78,66,57,0.14)] bg-white px-3 text-[13px] text-[#1F2423] outline-none focus:border-[rgba(202,33,55,0.45)]"
          >
            {modelOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-[#969E9A]">
            列表更新于 {formatModelsUpdatedAt(settings?.modelsUpdatedAt ?? null)}
            {settings?.modelsSource === "dashscope"
              ? " · DashScope"
              : " · 内置兜底"}
          </p>
        </label>

        <label className="block">
          <span className="text-[12px] font-medium text-[#59625F]">API Key</span>
          <input
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
            placeholder={
              settings?.apiKeyConfigured
                ? `已保存（${settings.apiKeyHint || "****"}），留空则不修改`
                : "粘贴 API Key"
            }
            className="mt-1.5 h-10 w-full rounded-[10px] border border-[rgba(78,66,57,0.14)] bg-white px-3 text-[13px] text-[#1F2423] outline-none focus:border-[rgba(202,33,55,0.45)]"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-[rgba(202,33,55,0.25)] bg-[rgba(202,33,55,0.06)] px-3.5 py-2 text-[12.5px] text-[#CA2137]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-xl border border-[rgba(94,155,117,0.28)] bg-[rgba(94,155,117,0.08)] px-3.5 py-2 text-[12.5px] text-[#2F6B4F]">
          {notice}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy || !model.trim()}
          className="inline-flex h-9 items-center justify-center rounded-[9px] bg-[#CA2137] px-4 text-[12.5px] font-medium text-white hover:bg-[#AD1A2D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveBusy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              保存中…
            </>
          ) : (
            "保存"
          )}
        </button>
        <button
          type="button"
          onClick={() => void onTest()}
          disabled={busy}
          className="inline-flex h-9 items-center justify-center rounded-[9px] border border-[rgba(202,33,55,0.3)] bg-transparent px-4 text-[12.5px] font-medium text-[#CA2137] hover:bg-[#F8EDEE] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testBusy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              测试中…
            </>
          ) : (
            "测试连通性"
          )}
        </button>
      </div>
    </div>
  );
}
