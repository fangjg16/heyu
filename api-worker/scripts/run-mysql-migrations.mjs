/**
 * 在 MySQL 8 上应用 schema.mysql.sql，再按序执行 migrations/*.sql
 * 环境变量：MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 * 或从 api-worker/.dev.vars 读取
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDevVars() {
  const devVarsPath = path.join(root, ".dev.vars");
  if (!fs.existsSync(devVarsPath)) return {};
  const map = {};
  for (const line of fs.readFileSync(devVarsPath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    map[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return map;
}

function envConfig() {
  const fromFile = loadDevVars();
  const pick = (key) => (process.env[key] ?? fromFile[key] ?? "").trim();
  return {
    host: pick("MYSQL_HOST"),
    port: Number(pick("MYSQL_PORT") || "3306"),
    user: pick("MYSQL_USER"),
    password: pick("MYSQL_PASSWORD"),
    database: pick("MYSQL_DATABASE"),
  };
}

function splitSqlStatements(sql) {
  const statements = [];
  let buf = "";
  for (const line of sql.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) continue;
    buf += `${line}\n`;
    if (trimmed.endsWith(";")) {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
    }
  }
  if (buf.trim()) statements.push(buf.trim());
  return statements;
}

function isBenignMysqlError(err) {
  const code = err?.code ?? "";
  const msg = String(err?.message ?? err ?? "");
  return (
    code === "ER_TABLE_EXISTS_ERROR" ||
    code === "ER_DUP_KEYNAME" ||
    code === "ER_DUP_FIELDNAME" ||
    /already exists/i.test(msg) ||
    /Duplicate column/i.test(msg) ||
    /Duplicate key name/i.test(msg)
  );
}

async function applySqlFile(conn, filePath, label) {
  const sql = fs.readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(sql);
  console.log(`[mysql:migrate] ${label} (${statements.length} statements)`);
  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/gu, " ").slice(0, 72);
    try {
      await conn.query(stmt);
      console.log(`[mysql:migrate] OK  ${preview}`);
      applied += 1;
    } catch (e) {
      if (isBenignMysqlError(e)) {
        console.log(`[mysql:migrate] skip ${preview}`);
        skipped += 1;
        continue;
      }
      console.error(`[mysql:migrate] FAIL ${preview}`);
      throw e;
    }
  }
  return { applied, skipped, total: statements.length };
}

async function main() {
  const cfg = envConfig();
  if (!cfg.host || !cfg.user || !cfg.database) {
    console.error(
      "[mysql:migrate] Missing MYSQL_HOST / MYSQL_USER / MYSQL_DATABASE in .dev.vars or env",
    );
    process.exit(1);
  }

  console.log(
    `[mysql:migrate] ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`,
  );

  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    multipleStatements: false,
    charset: "utf8mb4",
  });

  let applied = 0;
  let skipped = 0;
  let total = 0;

  try {
    const schemaPath = path.join(root, "schema.mysql.sql");
    const schemaResult = await applySqlFile(conn, schemaPath, "schema.mysql.sql");
    applied += schemaResult.applied;
    skipped += schemaResult.skipped;
    total += schemaResult.total;

    const migrationsDir = path.join(root, "migrations");
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const file of files) {
        const result = await applySqlFile(
          conn,
          path.join(migrationsDir, file),
          `migrations/${file}`,
        );
        applied += result.applied;
        skipped += result.skipped;
        total += result.total;
      }
    }
  } finally {
    await conn.end();
  }

  console.log(
    `[mysql:migrate] done (${applied} applied, ${skipped} skipped, ${total} total)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
