import { spawn } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "d:\\taizi\\api-worker";
const reportPath = join(root, "_build_result_report.txt");
const fullLogPath = join(root, "_build_full_log.txt");

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
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
      out += `\nSPAWN_ERROR=${err.message}\n`;
      resolve({ code: -1, out });
    });
    child.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

const lines = [];
function log(s) {
  lines.push(String(s));
}

log("=== BUILD REPORT ===");
log(`cwd=${root}`);
log(`started_at=${new Date().toISOString()}`);

let result = await run("npm", ["run", "build:production"]);
let used = "npm run build:production";

if (result.code !== 0) {
  log("npm failed; trying fallback: node scripts/build-production-bundle.mjs");
  const fallback = await run("node", ["scripts/build-production-bundle.mjs"]);
  if (fallback.code === 0 || fallback.out.length > result.out.length) {
    result = fallback;
    used = "node scripts/build-production-bundle.mjs";
  }
}

writeFileSync(fullLogPath, result.out, "utf8");

const allLines = result.out.split(/\r?\n/);
const last30 = allLines.slice(-30);
const hasIdent = result.out.includes("isFirstUserTurnInHistory");
const exitCode = result.code;
const errorGone =
  exitCode === 0 || !hasIdent ? "yes" : "no";

log(`COMMAND_USED=${used}`);
log(`EXIT_CODE=${exitCode}`);
log(`isFirstUserTurnInHistory_PRESENT_IN_OUTPUT=${hasIdent ? "yes" : "no"}`);
log(`isFirstUserTurnInHistory_ERROR_GONE=${errorGone}`);
log("");
log("LAST_30_LINES:");
for (const line of last30) log(line);
log("");
log(`ended_at=${new Date().toISOString()}`);
log(`worker_exists=${existsSync(join(root, "dist", "worker.mjs")) ? "yes" : "no"}`);

const report = lines.join("\n") + "\n";
writeFileSync(reportPath, report, "utf8");
writeFileSync(join(root, "_shell_alive.txt"), `alive-${Date.now()}\n`, "utf8");
process.stdout.write(report);
process.exit(exitCode === 0 ? 0 : 1);
