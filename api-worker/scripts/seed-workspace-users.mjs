/**
 * 种子：工作区演示账号（一人一登录名）
 * 用法：cd api-worker && npm run seed:workspace-users
 * Guest 可见项目请在项目「权限管理」中加入成员。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ITERS = 120_000;

const USERS = [
  {
    id: "candice-guo",
    username: "candiceguo",
    displayName: "CandiceGuo",
    orgTitle: "合域 · Admin",
    avatarChar: "C",
    avatarClass:
      "bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 1,
    password: "jfo2026",
  },
  {
    id: "jimmy-huang",
    username: "jimmyhuang",
    displayName: "JimmyHuang",
    orgTitle: "家族办公室 · Core 核心级",
    avatarChar: "J",
    avatarClass: "bg-primary text-primary-foreground shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 0,
    password: "jfo2026",
  },
  {
    id: "jessica-hu",
    username: "jessicahu",
    displayName: "JessicaHu",
    orgTitle: "投资顾问 · Advanced 进阶级",
    avatarChar: "S",
    avatarClass: "bg-[hsl(24,32%,44%)] text-[hsl(40,45%,98%)] shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 0,
    password: "jfo2026",
  },
  {
    id: "jensen-fang",
    username: "jensenfang",
    displayName: "JensenFang",
    orgTitle: "研究部 · Basic 基础级",
    avatarChar: "N",
    avatarClass: "bg-stone-400 text-stone-900 shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 0,
    password: "jfo2026",
  },
  {
    id: "binghe-su",
    username: "binghesu",
    displayName: "BingheSu",
    orgTitle: "研究部 · Basic 基础级",
    avatarChar: "B",
    avatarClass: "bg-stone-400 text-stone-900 shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 0,
    password: "jfo2026",
  },
  {
    id: "janice-hi",
    username: "janicehi",
    displayName: "JaniceHi",
    orgTitle: "访客 · Guest",
    avatarChar: "J",
    avatarClass: "bg-slate-300 text-slate-800 shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 0,
    password: "jfo2026",
  },
  {
    id: "peptide",
    username: "peptide",
    displayName: "Peptide",
    orgTitle: "访客 · 多肽项目",
    avatarChar: "P",
    avatarClass: "bg-slate-300 text-slate-800 shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 0,
    password: "peptide2026",
  },
  {
    id: "aishort",
    username: "aishort",
    displayName: "AIShort",
    orgTitle: "访客 · AI短剧项目",
    avatarChar: "A",
    avatarClass: "bg-slate-300 text-slate-800 shadow-sm",
    defaultRole: "guest",
    isPlatformAdmin: 0,
    password: "aidj2026",
  },
];

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

function hashPassword(password, saltBuf = crypto.randomBytes(16), iters = DEFAULT_ITERS) {
  const hash = crypto.pbkdf2Sync(password, saltBuf, iters, 32, "sha256");
  return {
    hash: hash.toString("hex"),
    salt: saltBuf.toString("hex"),
    iterations: iters,
  };
}

async function upsertUser(conn, user, t) {
  const { hash, salt, iterations } = hashPassword(user.password);
  const username = user.username.trim().toLowerCase();
  await conn.execute(
    `INSERT INTO workspace_users (
      id, username, display_name, org_title, avatar_char, avatar_class,
      default_role, is_platform_admin, status,
      password_hash, password_salt, password_iters,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      username = VALUES(username),
      display_name = VALUES(display_name),
      org_title = VALUES(org_title),
      avatar_char = VALUES(avatar_char),
      avatar_class = VALUES(avatar_class),
      default_role = VALUES(default_role),
      is_platform_admin = VALUES(is_platform_admin),
      status = 'active',
      password_hash = VALUES(password_hash),
      password_salt = VALUES(password_salt),
      password_iters = VALUES(password_iters),
      updated_at = VALUES(updated_at)`,
    [
      user.id,
      username,
      user.displayName,
      user.orgTitle,
      user.avatarChar,
      user.avatarClass,
      user.defaultRole,
      user.isPlatformAdmin,
      hash,
      salt,
      iterations,
      t,
      t,
    ],
  );
  console.log(`[seed] user ${user.id} (username=${username})`);
}

const cfg = envConfig();
if (!cfg.host || !cfg.user || !cfg.database) {
  console.error("[seed:workspace-users] 缺少 MYSQL_*，请先配置 api-worker/.dev.vars");
  process.exit(1);
}

const conn = await mysql.createConnection({
  ...cfg,
  connectTimeout: 15000,
});

const t = new Date().toISOString();
try {
  for (const user of USERS) {
    await upsertUser(conn, user, t);
  }
  console.log(
    "[seed:workspace-users] done（Guest 可见项目请在项目权限管理中加入成员）",
  );
} finally {
  await conn.end();
}
