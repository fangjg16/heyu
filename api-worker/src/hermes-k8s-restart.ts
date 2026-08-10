/**
 * Worker 侧：触发 Hermes Gateway 重启。
 * Node http-server 内部路由实际执行（本地 docker / ACK K8s）。
 */

export type HermesK8sEnv = {
  HERMES_K8S_NAMESPACE?: string;
  HERMES_K8S_DEPLOYMENT?: string;
  KUBERNETES_SERVICE_HOST?: string;
  KUBERNETES_SERVICE_PORT?: string;
  KUBERNETES_SERVICE_PORT_HTTPS?: string;
  /** auto | k8s | docker | off；缺省：有 KUBERNETES_SERVICE_HOST 则 k8s，否则 docker */
  HERMES_RESTART_MODE?: string;
  HERMES_DOCKER_CONTAINER?: string;
  /** http-server 注入，如 http://127.0.0.1:8787 */
  JFO_NODE_HELPER_BASE?: string;
  JFO_INTERNAL_KEY?: string;
};

function resolveRestartMode(env: HermesK8sEnv): "k8s" | "docker" | "off" {
  const explicit = (env.HERMES_RESTART_MODE || "").trim().toLowerCase();
  if (explicit === "k8s" || explicit === "docker" || explicit === "off") {
    return explicit;
  }
  return (env.KUBERNETES_SERVICE_HOST || "").trim() ? "k8s" : "docker";
}

export function hermesRestartConfigured(env: HermesK8sEnv): boolean {
  const mode = resolveRestartMode(env);
  if (mode === "off") return false;
  if (mode === "docker") return true;
  const ns = (env.HERMES_K8S_NAMESPACE || "").trim();
  const dep = (env.HERMES_K8S_DEPLOYMENT || "").trim();
  const host = (env.KUBERNETES_SERVICE_HOST || "").trim();
  return Boolean(ns && dep && host);
}

export type RestartGatewayResult =
  | {
      ok: true;
      namespace: string;
      deployment: string;
      restartedAt: string;
      hint?: string;
    }
  | {
      ok: false;
      error: string;
      hint?: string;
      httpStatus?: number;
    };

export async function restartHermesGatewayDeployment(
  env: HermesK8sEnv,
): Promise<RestartGatewayResult> {
  if (!hermesRestartConfigured(env)) {
    return {
      ok: false,
      error: "未启用 Gateway 重启",
      hint: "本地默认 docker；生产需 HERMES_K8S_*。可设 HERMES_RESTART_MODE=docker|k8s|off。",
      httpStatus: 503,
    };
  }

  const helper = (env.JFO_NODE_HELPER_BASE || "").trim().replace(/\/$/u, "");
  if (!helper) {
    return {
      ok: false,
      error: "未注入 JFO_NODE_HELPER_BASE",
      hint: "请用 api-worker/scripts/http-server.mjs / npm run dev:local 启动。",
      httpStatus: 503,
    };
  }

  const key = (env.JFO_INTERNAL_KEY || "").trim();
  if (!key) {
    return {
      ok: false,
      error: "未配置 JFO_INTERNAL_KEY",
      hint: "写在 local.dev.secrets.env，用 scripts/generate-local-config.ps1 生成 .dev.vars。",
      httpStatus: 503,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${helper}/__jfo/internal/restart-hermes-gateway`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: `调用 Node 重启助手失败：${String((e as Error)?.message ?? e)}`,
      httpStatus: 502,
    };
  }

  let data: {
    ok?: boolean;
    error?: string;
    hint?: string;
    namespace?: string;
    deployment?: string;
    restartedAt?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* ignore */
  }

  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || `重启助手 HTTP ${res.status}`,
      hint: data.hint,
      httpStatus: res.status >= 400 && res.status < 600 ? res.status : 502,
    };
  }

  return {
    ok: true,
    namespace: String(data.namespace ?? "local"),
    deployment: String(
      data.deployment ??
        env.HERMES_DOCKER_CONTAINER ??
        env.HERMES_K8S_DEPLOYMENT ??
        "hermes",
    ),
    restartedAt: String(data.restartedAt ?? new Date().toISOString()),
    hint: data.hint,
  };
}
