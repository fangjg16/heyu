import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "d:\\taizi\\api-worker";
const reportPath = join(root, "_report.txt");
const lines = [];
function log(s) {
  lines.push(String(s));
}

function run() {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "build:production"], {
      cwd: root,
      shell: true,
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      out += d.toString();
    });
    child.on("error", (err) => {
      log("SPAWN_ERROR=" + err.message);
      resolve({ code: -1, out });
    });
    child.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

const { code, out } = await run();
log("EXIT_CODE=" + code);
const allLines = out.split(/\r?\n/);
log("---LAST30---");
for (const line of allLines.slice(-30)) log(line);
log("---ENDLAST30---");
const worker = join(root, "dist", "worker.mjs");
const exists = existsSync(worker);
log("WORKER_EXISTS=" + (exists ? "yes" : "no"));
if (exists) {
  const text = readFileSync(worker, "utf8");
  log("HAS_取消成员请传=" + (text.includes("取消成员请传") ? "yes" : "no"));
  log("HAS_无效角色=" + (text.includes("无效角色") ? "yes" : "no"));
} else {
  log("HAS_取消成员请传=no");
  log("HAS_无效角色=no");
}
writeFileSync(reportPath, lines.join("\n") + "\n", "utf8");
console.log(lines.join("\n"));
