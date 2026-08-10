/**
 * 本地开发：MySQL bridge + Miniflare HTTP 服务（:8787，与前端 .env.local 一致）
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiWorkerRoot, loadApiWorkerEnv } from "./load-env.mjs";

const root = apiWorkerRoot;
const WORKER_PORT = Number(process.env.WORKER_LOCAL_PORT ?? "8787") || 8787;

loadApiWorkerEnv();

function loadDevVars() {
  const map = {};
  const p = path.join(root, ".dev.vars");
  if (!fs.existsSync(p)) return map;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/u)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

function isBridgeHealthy(url) {
  return fetch(url)
    .then((res) => res.ok)
    .catch(() => false);
}

function waitForBridge(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`MySQL bridge not ready: ${url}`));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function probeWorkerHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const vars = loadDevVars();
const bridgeUrl =
  (vars.MYSQL_BRIDGE_URL ?? "http://127.0.0.1:8790").trim() || "http://127.0.0.1:8790";
const watchMode =
  process.argv.includes("--watch") ||
  process.env.JFO_WORKER_WATCH === "1" ||
  process.env.WATCH === "1";

const children = [];

function shutdown() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/** 探测 :8787 上的旧 Worker 是否已包含登录路由（避免复用无鉴权的旧进程） */
async function probeAuthLoginRoute(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    // 有路由：400/401；无路由：404
    return res.status !== 404;
  } catch {
    return false;
  }
}

/** 探测用户管理 API（无 Bearer 时期望 401，而非 404） */
async function probeAdminUsersRoute(port) {
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/admin/workspace-users`,
    );
    return res.status !== 404;
  } catch {
    return false;
  }
}

async function probeAdminSkillsRoute(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/admin/skills`);
    return res.status !== 404;
  } catch {
    return false;
  }
}

/** 探测源文件大模型解析路由（无 Bearer 时期望 401，而非 404） */
async function probeParseSummaryRoute(port) {
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/projects/_probe/files/_probe/parse-summary?userId=_probe`,
    );
    return res.status !== 404;
  } catch {
    return false;
  }
}

async function ensureWorkerPortAvailable() {
  const inUse = await isPortInUse(WORKER_PORT);
  if (!inUse) return;

  const health = await probeWorkerHealth(WORKER_PORT);
  if (health?.dbDriver === "mysql" && health?.fileDriver === "minio") {
    const hasAuth = await probeAuthLoginRoute(WORKER_PORT);
    const hasAdminUsers = await probeAdminUsersRoute(WORKER_PORT);
    const hasAdminSkills = await probeAdminSkillsRoute(WORKER_PORT);
    const hasParseSummary = await probeParseSummaryRoute(WORKER_PORT);
    if (hasAuth && hasAdminUsers && hasAdminSkills && hasParseSummary) {
      console.log(
        `[dev:local] port ${WORKER_PORT} already serving expected stack (db=${health.dbDriver}, files=${health.fileDriver}, auth=ok, adminUsers=ok, adminSkills=ok, parseSummary=ok)`,
      );
      console.log(`[dev:local] Worker URL: http://127.0.0.1:${WORKER_PORT}`);
      process.exit(0);
    }
    console.error(
      `[dev:local] port ${WORKER_PORT} 上的 API 是旧进程（auth=${hasAuth ? "ok" : "missing"}, adminUsers=${hasAdminUsers ? "ok" : "missing"}, adminSkills=${hasAdminSkills ? "ok" : "missing"}, parseSummary=${hasParseSummary ? "ok" : "missing"}）。`,
    );
    console.error(
      "[dev:local] 请关闭占用 8787 的「JFO API Worker」窗口，然后：npm run build:production && npm run dev:local",
    );
    process.exit(1);
  }

  if (health) {
    console.error(
      `[dev:local] port ${WORKER_PORT} is occupied by another API (db=${health.dbDriver ?? "?"}, files=${health.fileDriver ?? "?"}).`,
    );
  } else {
    console.error(`[dev:local] port ${WORKER_PORT} is in use by another program.`);
  }
  console.error("[dev:local] Close the other process, then re-run npm run dev:local.");
  process.exit(1);
}

function newestMtimeMs(dir) {
  let newest = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      newest = Math.max(newest, newestMtimeMs(full));
    } else {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

async function ensureWorkerBundle() {
  const bundledWorker = path.join(root, "dist", "worker.mjs");
  const srcNewest = newestMtimeMs(path.join(root, "src"));
  const bundleMtime = fs.existsSync(bundledWorker)
    ? fs.statSync(bundledWorker).mtimeMs
    : 0;
  const needsBuild = !fs.existsSync(bundledWorker) || srcNewest > bundleMtime;
  if (!needsBuild && !watchMode) return;

  if (watchMode) {
    console.log("[dev:local] starting esbuild --watch (改 src 自动重编)...");
    const build = spawn(
      "node",
      ["scripts/build-production-bundle.mjs", "--watch"],
      {
        cwd: root,
        stdio: "inherit",
        shell: true,
      },
    );
    children.push(build);
    build.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(`[dev:local] build:watch exited with code ${code}`);
        shutdown();
      }
    });
    // 等首包写出
    const start = Date.now();
    while (!fs.existsSync(bundledWorker) || (needsBuild && fs.statSync(bundledWorker).mtimeMs < srcNewest)) {
      if (Date.now() - start > 60_000) {
        throw new Error("build:watch 超时：dist/worker.mjs 未生成");
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log("[dev:local] worker bundle ready (watch mode)");
    return;
  }

  console.log(
    fs.existsSync(bundledWorker)
      ? "[dev:local] src 比 dist/worker.mjs 新，重新 build:production..."
      : "[dev:local] dist/worker.mjs not found, running build:production...",
  );
  await new Promise((resolve, reject) => {
    const build = spawn("node", ["scripts/build-production-bundle.mjs"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    build.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build:production failed with exit code ${code ?? "unknown"}`));
    });
  });
  console.log("[dev:local] worker bundle ready");
}

async function main() {
  await ensureWorkerPortAvailable();
  await ensureWorkerBundle();

  const healthUrl = `${bridgeUrl}/health`;
  const bridgeHasSkills = async () => {
    try {
      const res = await fetch(`${bridgeUrl.replace(/\/+$/u, "")}/v1/skills`);
      // 有路由：200/401；无路由：404
      return res.status !== 404;
    } catch {
      return false;
    }
  };

  if (await isBridgeHealthy(healthUrl)) {
    if (!(await bridgeHasSkills())) {
      console.error(
        `[dev:local] 现有 MySQL bridge（${bridgeUrl}）过旧（缺少 /v1/skills）。请关闭占用 8790 的 bridge 进程后重试。`,
      );
      process.exit(1);
    }
    console.log(`[dev:local] reusing existing MySQL bridge at ${bridgeUrl}`);
  } else {
    const bridge = spawn("node", ["scripts/mysql-local-bridge.mjs"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    children.push(bridge);
    bridge.on("exit", (code) => {
      if (code && code !== 0) {
        console.error(`[dev:local] mysql bridge exited with code ${code}`);
        shutdown();
      }
    });
    console.log(`[dev:local] starting MySQL bridge, waiting for ${healthUrl} ...`);
    await waitForBridge(healthUrl);
    console.log("[dev:local] MySQL bridge ready");
  }

  console.log(`[dev:local] starting API server on http://127.0.0.1:${WORKER_PORT} ...`);
  if (watchMode) {
    console.log("[dev:local] hot reload ON：改 api-worker/src 后自动重编并热加载，无需手动 build:production");
  }
  const server = spawn("node", ["scripts/http-server.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      JFO_LOAD_DEV_VARS: "1",
      JFO_WORKER_WATCH: watchMode ? "1" : process.env.JFO_WORKER_WATCH ?? "",
      HOST: "127.0.0.1",
      PORT: String(WORKER_PORT),
    },
  });
  children.push(server);
  server.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e);
  shutdown();
});
