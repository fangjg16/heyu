/**
 * 本地 MySQL 桥接（Node 进程，供 Wrangler Worker 经 fetch 访问）
 * Worker 内不能加载 mysql2（会触发 Code generation from strings disallowed）
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { tryHandleSkillsRoutes } from "./skills-http.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = 8790;
const DEFAULT_HOST = "0.0.0.0";

function parsePort(value, fallback, name) {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    console.error(
      `[mysql-bridge] Invalid ${name}=${JSON.stringify(value)}; expected 1-65535, using ${fallback}`,
    );
    return fallback;
  }
  return n;
}

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

function envConfig() {
  const fromFile = loadDevVars();
  const pick = (k) => (process.env[k] ?? fromFile[k] ?? "").trim();
  return {
    host: pick("MYSQL_HOST"),
    port: parsePort(pick("MYSQL_PORT"), 3306, "MYSQL_PORT"),
    user: pick("MYSQL_USER"),
    password: pick("MYSQL_PASSWORD"),
    database: pick("MYSQL_DATABASE"),
    bridgePort: parsePort(pick("MYSQL_BRIDGE_PORT"), DEFAULT_PORT, "MYSQL_BRIDGE_PORT"),
    bridgeHost: pick("MYSQL_BRIDGE_HOST") || pick("HOST") || DEFAULT_HOST,
    bridgeKey: pick("MYSQL_BRIDGE_KEY"),
    pick,
  };
}

function requireBridgeAuth(req, cfg, res) {
  if (!cfg.bridgeKey) return true;
  const auth = req.headers.authorization ?? "";
  if (auth === `Bearer ${cfg.bridgeKey}`) return true;
  json(res, 401, { error: "unauthorized" });
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function plainRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  }
  return out;
}

async function main() {
  const cfg = envConfig();
  if (!cfg.host || !cfg.user || !cfg.database) {
    console.error("[mysql-bridge] Missing MYSQL_HOST / MYSQL_USER / MYSQL_DATABASE");
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
    timezone: "Z",
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${cfg.bridgePort}`);

    if (req.method === "GET" && url.pathname === "/health") {
      try {
        await pool.query("SELECT 1 AS ok");
        json(res, 200, { ok: true, database: cfg.database, host: cfg.host });
      } catch (e) {
        json(res, 503, { ok: false, error: String(e?.message ?? e) });
      }
      return;
    }

    if (
      await tryHandleSkillsRoutes(req, res, url, {
        pick: cfg.pick,
        bridgeKey: cfg.bridgeKey,
      })
    ) {
      return;
    }

    if (req.method !== "POST" || url.pathname !== "/v1/execute") {
      json(res, 404, { error: "not found" });
      return;
    }

    if (!requireBridgeAuth(req, cfg, res)) return;

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      json(res, 400, { error: "invalid json" });
      return;
    }

      const sql = typeof body.sql === "string" ? body.sql : "";
    const params = (Array.isArray(body.params) ? body.params : []).map((p) =>
      p === undefined ? null : p,
    );
    const mode = body.mode === "first" || body.mode === "run" ? body.mode : "all";

    if (!sql) {
      json(res, 400, { error: "missing sql" });
      return;
    }

    try {
      const [result, fields] = await pool.execute(sql, params);
      if (mode === "run") {
        const meta = result;
        json(res, 200, {
          success: true,
          meta: {
            changes: meta?.affectedRows ?? 0,
            last_row_id: meta?.insertId ?? 0,
          },
        });
        return;
      }

      const rows = Array.isArray(result) ? result.map(plainRow) : [];
      if (mode === "first") {
        json(res, 200, { success: true, row: rows[0] ?? null });
        return;
      }

      json(res, 200, { success: true, results: rows });
    } catch (e) {
      json(res, 500, { success: false, error: String(e?.message ?? e) });
    }
  });

  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE") {
      console.error(
        `[mysql-bridge] port ${cfg.bridgePort} already in use. Stop the other bridge or set MYSQL_BRIDGE_PORT in .dev.vars`,
      );
    } else {
      console.error("[mysql-bridge]", err);
    }
    process.exit(1);
  });

  server.listen(cfg.bridgePort, cfg.bridgeHost, () => {
    console.log(
      `[mysql-bridge] listening http://${cfg.bridgeHost}:${cfg.bridgePort} -> ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
