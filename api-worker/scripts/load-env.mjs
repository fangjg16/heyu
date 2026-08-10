/** 从 .dev.vars 或指定 dotenv 文件加载环境变量（不覆盖已有 process.env） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiWorkerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  return true;
}

export function loadApiWorkerEnv(options = {}) {
  const devVarsPath =
    options.devVarsPath?.trim() ||
    process.env.JFO_DEV_VARS_PATH?.trim() ||
    path.join(apiWorkerRoot, ".dev.vars");
  loadDotEnvFile(devVarsPath);

  if (!process.env.DB_DRIVER) process.env.DB_DRIVER = "mysql";
  if (!process.env.FILE_DRIVER) process.env.FILE_DRIVER = "minio";
}

export { apiWorkerRoot };
