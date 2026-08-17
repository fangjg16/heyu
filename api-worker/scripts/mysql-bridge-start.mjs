/**
 * ECS mysql-bridge 入口：库空时从仓库 skills 灌入 MySQL，再启动 bridge。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function run(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
}

const migrate = await run("run-mysql-migrations.mjs");
if (migrate.code !== 0) {
  console.warn(
    `[mysql-bridge] mysql:migrate 未成功（code=${migrate.code}），继续启动 bridge`,
  );
}

const seed = await run("seed-hermes-skills-from-fs.mjs", ["--if-empty"]);
if (seed.code !== 0) {
  console.warn(
    `[mysql-bridge] seed:hermes-skills 未成功（code=${seed.code}），继续启动 bridge`,
  );
}

const bridge = await run("mysql-local-bridge.mjs");
process.exit(bridge.code);
