import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devVars = path.join(root, ".dev.vars");
const map = {};
if (fs.existsSync(devVars)) {
  for (const line of fs.readFileSync(devVars, "utf8").split(/\r?\n/u)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
const pick = (k) => process.env[k] ?? map[k] ?? "";
const conn = await mysql.createConnection({
  host: pick("MYSQL_HOST"),
  port: Number(pick("MYSQL_PORT") || "3306"),
  user: pick("MYSQL_USER"),
  password: pick("MYSQL_PASSWORD"),
  database: pick("MYSQL_DATABASE"),
  connectTimeout: 15000,
});
const [rows] = await conn.execute(
  "SELECT id, name FROM projects ORDER BY updated_at DESC",
);
await conn.end();
fs.writeFileSync(
  path.join(root, "_project-lookup.json"),
  JSON.stringify(rows, null, 2),
  "utf8",
);
console.log(JSON.stringify(rows, null, 2));
