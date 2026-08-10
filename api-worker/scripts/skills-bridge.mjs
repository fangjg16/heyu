/**
 * 独立 Skills Bridge（无 MySQL）：读写 Hermes skills 文件卷
 * 生产：挂载与 Hermes 相同 /opt/data，SOURCE=DIR=/opt/data/skills
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  skillsHealthPayload,
  tryHandleSkillsRoutes,
} from "./skills-http.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = 8791;
const DEFAULT_HOST = "0.0.0.0";

function parsePort(value, fallback, name) {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    console.error(
      `[skills-bridge] Invalid ${name}=${JSON.stringify(value)}; expected 1-65535, using ${fallback}`,
    );
    return fallback;
  }
  return n;
}

function loadEnvFile(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

function envConfig() {
  const fromFile = {
    ...loadEnvFile(path.join(root, ".dev.vars")),
    ...loadEnvFile(path.join(root, ".env")),
  };
  const pick = (k) => (process.env[k] ?? fromFile[k] ?? "").trim();
  return {
    bridgePort: parsePort(
      pick("SKILLS_BRIDGE_PORT"),
      DEFAULT_PORT,
      "SKILLS_BRIDGE_PORT",
    ),
    bridgeHost: pick("SKILLS_BRIDGE_HOST") || pick("HOST") || DEFAULT_HOST,
    bridgeKey: pick("SKILLS_BRIDGE_KEY") || pick("MYSQL_BRIDGE_KEY"),
    allowInsecure: pick("SKILLS_BRIDGE_ALLOW_INSECURE") === "1",
    pick,
  };
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function main() {
  const cfg = envConfig();

  if (!cfg.bridgeKey && !cfg.allowInsecure) {
    console.error(
      "[skills-bridge] SKILLS_BRIDGE_KEY is required (or set SKILLS_BRIDGE_ALLOW_INSECURE=1 for local only)",
    );
    process.exit(1);
  }
  if (!cfg.bridgeKey) {
    console.warn(
      "[skills-bridge] WARNING: running without auth (SKILLS_BRIDGE_ALLOW_INSECURE=1)",
    );
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${cfg.bridgePort}`);

    if (
      req.method === "GET" &&
      (url.pathname === "/healthz" || url.pathname === "/health")
    ) {
      try {
        const payload = skillsHealthPayload(cfg.pick);
        json(res, payload.sourceExists ? 200 : 503, payload);
      } catch (e) {
        json(res, 503, { ok: false, error: String(e?.message ?? e) });
      }
      return;
    }

    const handled = await tryHandleSkillsRoutes(req, res, url, {
      pick: cfg.pick,
      bridgeKey: cfg.bridgeKey,
    });
    if (handled) return;

    json(res, 404, { error: "not found" });
  });

  server.on("error", (err) => {
    if (err?.code === "EADDRINUSE") {
      console.error(
        `[skills-bridge] port ${cfg.bridgePort} already in use. Set SKILLS_BRIDGE_PORT.`,
      );
    } else {
      console.error("[skills-bridge]", err);
    }
    process.exit(1);
  });

  server.listen(cfg.bridgePort, cfg.bridgeHost, () => {
    const health = skillsHealthPayload(cfg.pick);
    console.log(
      `[skills-bridge] listening http://${cfg.bridgeHost}:${cfg.bridgePort}` +
        ` volumeMode=${health.volumeMode} source=${health.sourceDir}`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
