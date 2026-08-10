import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "d:\\taizi\\api-worker";
const logPath = join(root, "_build_capture.txt");

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
      out += `\nSPAWN_ERROR: ${err.message}\n`;
      resolve({ code: 1, out });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, out });
    });
  });
}

const { code, out } = await run("npm", ["run", "build:production"]);
const lines = out.split(/\r?\n/);
const last30 = lines.slice(-30).join("\n");
const hasIsFirst = /isFirstUserTurnInHistory/.test(out);
const report = [
  `EXIT_CODE=${code}`,
  `HAS_isFirstUserTurnInHistory_IN_OUTPUT=${hasIsFirst}`,
  "=== FULL OUTPUT ===",
  out,
  "=== LAST 30 LINES ===",
  last30,
].join("\n");
writeFileSync(logPath, report, "utf8");
console.log(report);
process.exit(code);
