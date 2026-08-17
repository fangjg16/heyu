/**
 * 将本地 skills 目录灌入 MySQL（hermes_skills / hermes_skill_files）
 * 用法：cd api-worker && npm run seed:hermes-skills
 * 环境：MYSQL_*（或 .dev.vars）；可选 HERMES_SKILLS_SOURCE
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "..");
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 500;
const TEXT_EXT_RE =
  /\.(md|markdown|txt|json|ya?ml|html?|css|js|mjs|cjs|ts|tsx|jsx|sh|py|xml|svg|csv|toml|ini|cfg|conf)$/iu;

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

function pick(envFile, k, fallback = "") {
  return (process.env[k] ?? envFile[k] ?? fallback).trim();
}

function walkFiles(dir, baseRel = "") {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const rel = baseRel ? `${baseRel}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full, rel));
    else if (ent.isFile()) out.push({ rel, full });
  }
  return out;
}

function titleFromMd(content, fallback) {
  for (const line of content.split(/\r?\n/u)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) {
      return t.replace(/^#+\s*/u, "").trim().slice(0, 200) || fallback;
    }
    break;
  }
  return fallback;
}

function listSkillDirs(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) return [];
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .filter((e) => !e.name.includes("_deprecated"))
    .filter((e) => fs.existsSync(path.join(skillsRoot, e.name, "SKILL.md")))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const envFile = loadDevVars();
  const host = pick(envFile, "MYSQL_HOST");
  const user = pick(envFile, "MYSQL_USER");
  const password = pick(envFile, "MYSQL_PASSWORD");
  const database = pick(envFile, "MYSQL_DATABASE");
  const port = Number.parseInt(pick(envFile, "MYSQL_PORT", "3306"), 10) || 3306;
  if (!host || !user || !database) {
    console.error("Missing MYSQL_HOST / MYSQL_USER / MYSQL_DATABASE");
    process.exit(1);
  }

  const skillsRoot = path.resolve(
    pick(
      envFile,
      "HERMES_SKILLS_SOURCE",
      path.join(repoRoot, "hermes-railway", "skills"),
    ),
  );
  console.log(`[seed-hermes-skills] source=${skillsRoot}`);

  const names = listSkillDirs(skillsRoot);
  if (names.length === 0) {
    console.error("No skills with SKILL.md found");
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    charset: "utf8mb4",
  });

  const ts = new Date().toISOString();
  let imported = 0;

  try {
    if (process.argv.includes("--if-empty")) {
      try {
        const [rows] = await conn.query(
          "SELECT COUNT(*) AS c FROM hermes_skills",
        );
        const n = Number(rows?.[0]?.c ?? 0);
        if (n > 0) {
          console.log(
            `[seed-hermes-skills] skip (--if-empty)：库中已有 ${n} 个 skill`,
          );
          return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[seed-hermes-skills] 无法检查 hermes_skills（${msg}），跳过灌库`,
        );
        return;
      }
    }
    for (const name of names) {
      const dir = path.join(skillsRoot, name);
      const walked = walkFiles(dir);
      if (walked.length > MAX_FILES) {
        console.warn(`skip ${name}: too many files`);
        continue;
      }
      const files = [];
      for (const { rel, full } of walked) {
        const buf = fs.readFileSync(full);
        if (buf.length > MAX_FILE_BYTES) {
          throw new Error(`${name}/${rel} too large`);
        }
        files.push({
          rel,
          content_b64: buf.toString("base64"),
          is_text: TEXT_EXT_RE.test(rel) ? 1 : 0,
          byte_size: buf.length,
        });
      }
      const skillMd = files.find((f) => f.rel === "SKILL.md");
      if (!skillMd) continue;
      const title = titleFromMd(
        Buffer.from(skillMd.content_b64, "base64").toString("utf8"),
        name,
      );

      await conn.execute(
        `INSERT INTO hermes_skills
          (name, title, description, created_at, updated_at, synced_at, sync_status, sync_error)
         VALUES (?, ?, '', ?, ?, NULL, 'pending', NULL)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           updated_at = VALUES(updated_at),
           sync_status = 'pending',
           sync_error = NULL`,
        [name, title, ts, ts],
      );
      await conn.execute(`DELETE FROM hermes_skill_files WHERE skill_name = ?`, [
        name,
      ]);
      for (const f of files) {
        await conn.execute(
          `INSERT INTO hermes_skill_files
            (skill_name, rel_path, content_b64, is_text, byte_size, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [name, f.rel, f.content_b64, f.is_text, f.byte_size, ts],
        );
      }
      imported += 1;
      console.log(`  + ${name} (${files.length} files)`);
    }
  } finally {
    await conn.end();
  }

  console.log(
    `[seed-hermes-skills] imported ${imported}/${names.length}. ` +
      `Admin 可点「同步全部到卷」，或 POST /api/admin/skills/sync。宿主机=${os.hostname()}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
