/** MySQL 桥接冒烟测试：cd api-worker && node scripts/test-mysql-adapter.mjs */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMysqlDatabase } from "../src/mysql-db.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridgeUrl = "http://127.0.0.1:8790";

const bridge = spawn("node", ["scripts/mysql-local-bridge.mjs"], {
  cwd: root,
  stdio: "pipe",
  shell: true,
});

async function waitHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${bridgeUrl}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("bridge not ready");
}

try {
  await waitHealth();
  const db = await createMysqlDatabase({ MYSQL_BRIDGE_URL: bridgeUrl });
  const { results } = await db.prepare("SELECT COUNT(*) AS n FROM projects").all();
  console.log("projects count:", results[0]?.n ?? results[0]);
  console.log("OK: mysql bridge adapter");
} finally {
  bridge.kill();
}
