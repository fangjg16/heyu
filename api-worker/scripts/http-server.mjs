/**
 * JFO API HTTP 服务：Miniflare 运行 Worker 入口（ACK K8s / 本地开发）
 * 依赖：DB_DRIVER=mysql、FILE_DRIVER=minio、MYSQL_*、MINIO_* 等
 */
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { restartHermesGatewayFromNode } from "./hermes-k8s-restart-node.mjs";
import { apiWorkerRoot, loadApiWorkerEnv } from "./load-env.mjs";
import { resolveUrlEnvForWorkerd } from "./resolve-docker-dns-for-workerd.mjs";

const root = apiWorkerRoot;
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? "8787") || 8787;
/**
 * 章节 generate / 概览 LLM 可能远超默认 2–5 分钟。
 * 可用环境变量覆盖（毫秒）；设为 0 表示不限制（仅 Node server.timeout/requestTimeout）。
 */
const REQUEST_TIMEOUT_MS = (() => {
  const raw = (process.env.JFO_HTTP_REQUEST_TIMEOUT_MS ?? "").trim();
  if (raw === "0") return 0;
  const n = Number(raw || "1800000"); // 默认 30 分钟
  return Number.isFinite(n) && n >= 0 ? n : 1_800_000;
})();

if (process.env.JFO_LOAD_DEV_VARS === "1") {
  loadApiWorkerEnv();
}

// workerd 无法稳定使用 Docker 内置 DNS；先由 Node 把 hermes 等服务名解析成 IP
await resolveUrlEnvForWorkerd(process.env);

const bundledWorker = path.join(root, "dist", "worker.mjs");
const useBundledWorker = fs.existsSync(bundledWorker);
const scriptPath =
  process.env.WORKER_SCRIPT_PATH?.trim() ||
  (useBundledWorker ? bundledWorker : path.join(root, "src", "index.ts"));

function createMiniflareOptions() {
  const common = {
    compatibilityDate: "2024-11-01",
    compatibilityFlags: ["nodejs_compat"],
    bindings: buildBindings(),
  };
  if (useBundledWorker && scriptPath === bundledWorker) {
    return {
      ...common,
      modulesRoot: root,
      modules: [{ type: "ESModule", path: "dist/worker.mjs" }],
    };
  }
  return {
    ...common,
    scriptPath,
    modules: true,
  };
}

function buildBindings() {
  const keys = [
    "DB_DRIVER",
    "MYSQL_HOST",
    "MYSQL_PORT",
    "MYSQL_USER",
    "MYSQL_PASSWORD",
    "MYSQL_DATABASE",
    "MYSQL_BRIDGE_URL",
    "MYSQL_BRIDGE_KEY",
    "SKILLS_BRIDGE_URL",
    "SKILLS_BRIDGE_KEY",
    "FILE_DRIVER",
    "MINIO_ENDPOINT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
    "MINIO_REGION",
    "MINIO_MAX_UPLOAD_BYTES",
    "DASHSCOPE_API_KEY",
    "DASHSCOPE_BASE_URL",
    "TAVILY_API_KEY",
    "HERMES_BASE_URL",
    "HERMES_API_KEY",
    "HERMES_MODEL",
    "HERMES_K8S_NAMESPACE",
    "HERMES_K8S_DEPLOYMENT",
    "HERMES_RESTART_MODE",
    "HERMES_DOCKER_CONTAINER",
    "KUBERNETES_SERVICE_HOST",
    "KUBERNETES_SERVICE_PORT",
    "KUBERNETES_SERVICE_PORT_HTTPS",
    "JFO_INTERNAL_KEY",
    "JFO_API_PUBLIC_BASE",
    "JFO_NODE_HELPER_BASE",
    "ALLOWED_ORIGIN",
    "EMBED_MODEL",
    "EMBED_DIMENSION",
    "EMBED_INSTRUCT",
    "KN_SLOT_BATCH_V2_ENABLED",
    "KN_SLOT_BATCH_PARALLEL_LIMIT",
    "KN_GENERATION_MODE",
    "KN_SLOT_BATCH_SMOKE_ENABLED",
  ];
  const bindings = {};
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== "") bindings[k] = v;
  }
  // Worker → 本进程内部路由（K8s / docker restart），避免 Worker 打包 node:https
  if (!bindings.JFO_NODE_HELPER_BASE) {
    bindings.JFO_NODE_HELPER_BASE = `http://127.0.0.1:${port}`;
  }
  // 本地未显式指定时默认 docker，管理台按钮可用
  if (!bindings.HERMES_RESTART_MODE && !bindings.KUBERNETES_SERVICE_HOST) {
    bindings.HERMES_RESTART_MODE = "docker";
  }
  return bindings;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

let mf = new Miniflare(createMiniflareOptions());
let mfReady = mf.ready;
let reloading = Promise.resolve();

async function reloadBundledWorker(reason) {
  if (!(useBundledWorker && scriptPath === bundledWorker)) return;
  reloading = (async () => {
    console.log(`[jfo-api] reloading worker (${reason})...`);
    const prev = mf;
    const next = new Miniflare(createMiniflareOptions());
    await next.ready;
    mf = next;
    mfReady = Promise.resolve();
    try {
      await prev.dispose();
    } catch (e) {
      console.warn("[jfo-api] previous Miniflare dispose:", e?.message ?? e);
    }
    console.log("[jfo-api] worker reloaded");
  })().catch((e) => {
    console.error("[jfo-api] reload failed:", e);
  });
  await reloading;
}

console.log(
  `[jfo-api] worker script: ${useBundledWorker && scriptPath === bundledWorker ? "dist/worker.mjs (bundled)" : scriptPath}`,
);

await mfReady;

if (
  process.env.JFO_WORKER_WATCH === "1" &&
  useBundledWorker &&
  scriptPath === bundledWorker
) {
  let timer = null;
  const scheduleReload = (reason) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void reloadBundledWorker(reason);
    }, 200);
  };
  try {
    fs.watch(bundledWorker, { persistent: true }, (eventType) => {
      scheduleReload(eventType || "change");
    });
    console.log("[jfo-api] watching dist/worker.mjs for hot reload");
  } catch (e) {
    console.warn("[jfo-api] watch failed:", e?.message ?? e);
  }
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function bearerMatches(req, expected) {
  if (!expected) return false;
  const raw = req.headers.authorization ?? "";
  const m = /^Bearer\s+(.+)$/iu.exec(String(raw).trim());
  return Boolean(m && m[1] === expected);
}

const server = createServer(async (req, res) => {
  try {
    const reqPath = (req.url ?? "/").split("?")[0];
    if (
      reqPath === "/__jfo/internal/restart-hermes-gateway" &&
      req.method === "POST"
    ) {
      const key = (process.env.JFO_INTERNAL_KEY ?? "").trim();
      if (!bearerMatches(req, key)) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      const result = await restartHermesGatewayFromNode();
      sendJson(res, result.ok ? 200 : (result.httpStatus ?? 503), result);
      return;
    }

    const url = `http://127.0.0.1:${port}${req.url ?? "/"}`;
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await readRequestBody(req) : undefined;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else headers.set(k, v);
    }

    await reloading;
    const response = await mf.dispatchFetch(url, {
      method: req.method,
      headers,
      body: body?.length ? body : undefined,
    });

    if (response.status >= 400) {
      const preview = await response.clone().text();
      console.error(
        `[jfo-api] ${req.method} ${req.url} -> HTTP ${response.status} ${preview.slice(0, 800)}`,
      );
    }

    res.statusCode = response.status;
    response.headers.forEach((v, k) => {
      if (k.toLowerCase() === "transfer-encoding") return;
      res.setHeader(k, v);
    });

    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (e) {
    console.error("[jfo-api]", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: String(e?.message ?? e) }));
  }
});

// 拉长入站超时，避免章节 generate 等多路长请求被 Node 默认超时掐断（浏览器侧表现为 Failed to fetch）
server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout =
  REQUEST_TIMEOUT_MS === 0
    ? 0
    : Math.max(REQUEST_TIMEOUT_MS + 60_000, 120_000);
server.timeout = REQUEST_TIMEOUT_MS;
server.keepAliveTimeout = Math.min(
  120_000,
  REQUEST_TIMEOUT_MS === 0 ? 120_000 : Math.max(10_000, REQUEST_TIMEOUT_MS),
);

server.listen(port, host, () => {
  console.log(`[jfo-api] http server http://${host}:${port}`);
  console.log(
    `[jfo-api] requestTimeout=${REQUEST_TIMEOUT_MS === 0 ? "disabled" : `${REQUEST_TIMEOUT_MS}ms`} (JFO_HTTP_REQUEST_TIMEOUT_MS)`,
  );
  console.log(`[jfo-api] db=${process.env.DB_DRIVER ?? "mysql"} files=${process.env.FILE_DRIVER ?? "minio"}`);
});
