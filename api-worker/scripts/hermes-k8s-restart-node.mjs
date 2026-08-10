/**
 * Node 侧重启 Hermes Gateway：
 * - 集群内：kubectl rollout restart 等价 PATCH
 * - 本地：docker restart（默认容器 jfo-hermes-local）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import https from "node:https";

const SA_TOKEN_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/token";
const SA_CA_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
const DEFAULT_DOCKER_CONTAINER = "jfo-hermes-local";

function envPick(key) {
  return String(process.env[key] ?? "").trim();
}

/** auto | k8s | docker | off */
function resolveRestartMode() {
  const explicit = envPick("HERMES_RESTART_MODE").toLowerCase();
  if (explicit === "k8s" || explicit === "docker" || explicit === "off") {
    return explicit;
  }
  return envPick("KUBERNETES_SERVICE_HOST") ? "k8s" : "docker";
}

function patchDeployment(host, port, namespace, deployment, patchBody, token, caPem) {
  const reqPath =
    `/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}` +
    `/deployments/${encodeURIComponent(deployment)}`;
  const payload = JSON.stringify(patchBody);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        port,
        path: reqPath,
        method: "PATCH",
        ca: caPem,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/strategic-merge-patch+json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function runDockerRestart(container) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["restart", container], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (e) => {
      resolve({
        ok: false,
        error: `无法执行 docker：${String(e?.message ?? e)}`,
        hint: "请确认已安装 Docker Desktop，且 docker 在 PATH 中。",
        httpStatus: 503,
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          ok: true,
          namespace: "local",
          deployment: container,
          restartedAt: new Date().toISOString(),
          hint: `已 docker restart ${container}；稍等 gateway /health 就绪后再试对话。`,
        });
        return;
      }
      resolve({
        ok: false,
        error:
          (stderr || stdout || `docker restart 退出码 ${code}`).trim().slice(0, 500),
        hint: `请先启动：cd hermes-railway && docker compose -f docker-compose.local.yml up -d（容器名 ${container}）`,
        httpStatus: 503,
      });
    });
  });
}

export function hermesRestartConfiguredFromProcessEnv() {
  const mode = resolveRestartMode();
  if (mode === "off") return false;
  if (mode === "docker") return true;
  return Boolean(
    envPick("HERMES_K8S_NAMESPACE") &&
      envPick("HERMES_K8S_DEPLOYMENT") &&
      envPick("KUBERNETES_SERVICE_HOST"),
  );
}

async function restartViaK8s() {
  const namespace = envPick("HERMES_K8S_NAMESPACE");
  const deployment = envPick("HERMES_K8S_DEPLOYMENT");
  if (!namespace || !deployment) {
    return {
      ok: false,
      error: "未配置 HERMES_K8S_NAMESPACE / HERMES_K8S_DEPLOYMENT",
      hint: "生产 ACK 需配置；本地将 HERMES_RESTART_MODE=docker 或不设（默认本地用 docker）。",
      httpStatus: 503,
    };
  }

  const host = envPick("KUBERNETES_SERVICE_HOST");
  if (!host) {
    return {
      ok: false,
      error: "当前不在 Kubernetes Pod 内（缺少 KUBERNETES_SERVICE_HOST）",
      hint: "本地请用 docker 模式；ACK 请挂 ServiceAccount。",
      httpStatus: 503,
    };
  }

  const port = Number.parseInt(
    envPick("KUBERNETES_SERVICE_PORT_HTTPS") ||
      envPick("KUBERNETES_SERVICE_PORT") ||
      "443",
    10,
  );
  if (!Number.isFinite(port) || port < 1) {
    return {
      ok: false,
      error: "无效的 KUBERNETES_SERVICE_PORT",
      httpStatus: 503,
    };
  }

  let token;
  let caPem;
  try {
    token = fs.readFileSync(SA_TOKEN_PATH, "utf8").trim();
    caPem = fs.readFileSync(SA_CA_PATH, "utf8");
  } catch {
    return {
      ok: false,
      error: "无法读取 ServiceAccount token / ca.crt",
      hint: "确认 api-worker Pod 已挂载 serviceAccount，且 Role 可 patch hermes-gateway。",
      httpStatus: 503,
    };
  }

  const restartedAt = new Date().toISOString();
  const patchBody = {
    spec: {
      template: {
        metadata: {
          annotations: {
            "kubectl.kubernetes.io/restartedAt": restartedAt,
          },
        },
      },
    },
  };

  let result;
  try {
    result = await patchDeployment(
      host,
      port,
      namespace,
      deployment,
      patchBody,
      token,
      caPem,
    );
  } catch (e) {
    return {
      ok: false,
      error: `调用 Kubernetes API 失败：${String(e?.message ?? e)}`,
      httpStatus: 502,
    };
  }

  if (result.status < 200 || result.status >= 300) {
    return {
      ok: false,
      error: `Kubernetes API ${result.status}：${result.body.slice(0, 400) || "error"}`,
      hint:
        result.status === 403
          ? "RBAC 不足：需 Role 对 deployments/hermes-gateway 的 get+patch。"
          : undefined,
      httpStatus: result.status === 404 ? 404 : 502,
    };
  }

  return {
    ok: true,
    namespace,
    deployment,
    restartedAt,
    hint: `已触发 ${namespace}/${deployment} 滚动重启；进行中的 Hermes 任务可能中断。`,
  };
}

export async function restartHermesGatewayFromNode() {
  const mode = resolveRestartMode();
  if (mode === "off") {
    return {
      ok: false,
      error: "HERMES_RESTART_MODE=off",
      httpStatus: 503,
    };
  }
  if (mode === "docker") {
    const container =
      envPick("HERMES_DOCKER_CONTAINER") || DEFAULT_DOCKER_CONTAINER;
    return runDockerRestart(container);
  }
  return restartViaK8s();
}
