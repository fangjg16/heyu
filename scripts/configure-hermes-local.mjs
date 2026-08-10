/**
 * Configure local Hermes Docker for DashScope (reads local.dev.secrets.env)
 * Usage: node scripts/configure-hermes-local.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretsFile = path.join(root, "local.dev.secrets.env");
const container = "jfo-hermes-local";

function log(msg) {
  console.log(`[configure-hermes] ${msg}`);
}

function die(msg) {
  console.error(`[configure-hermes] ERROR: ${msg}`);
  process.exit(1);
}

function readDotEnv(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: false,
    ...opts,
  });
  if (r.error) die(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    die(
      `${cmd} ${args.join(" ")} failed (exit ${r.status})\n${r.stdout || ""}\n${r.stderr || ""}`,
    );
  }
  return (r.stdout || "").trim();
}

function dockerExec(args, opts = {}) {
  return run("docker", ["exec", ...opts.envArgs, container, ...args], opts);
}

log(`secrets=${secretsFile}`);
const cfg = readDotEnv(secretsFile);
const base = cfg.LLM_API_BASE_URL || "";
const key = cfg.LLM_API_KEY || "";
const model = cfg.LLM_MODEL || "";
if (!base || !key || !model) {
  die("local.dev.secrets.env needs LLM_API_BASE_URL, LLM_API_KEY, LLM_MODEL");
}
if (/你的|changeme|xxx|placeholder/iu.test(key)) {
  die("LLM_API_KEY looks like a placeholder");
}
log(`model=${model} base=${base} keyLen=${key.length} keyPrefix=${key.slice(0, 7)}...`);

const names = run("docker", ["ps", "--format", "{{.Names}}"]);
if (!names.split(/\r?\n/u).includes(container)) {
  die(`Container ${container} not running. Start: cd hermes-railway && docker compose -f docker-compose.local.yml up -d`);
}

// Resolve hermes CLI inside container
let hermesCli = "";
for (const c of ["hermes", "/opt/hermes/bin/hermes", "/usr/local/bin/hermes"]) {
  const r = spawnSync(
    "docker",
    ["exec", container, "sh", "-c", `command -v ${c} 2>/dev/null || test -x ${c} && echo ${c}`],
    { encoding: "utf8" },
  );
  const out = (r.stdout || "").trim();
  if (r.status === 0 && out) {
    hermesCli = out.split(/\r?\n/u)[0].trim();
    break;
  }
}
if (!hermesCli) die("hermes CLI not found in container");
log(`CLI=${hermesCli}`);

function hermesConfigSet(dotted, value) {
  log(`set ${dotted}`);
  run("docker", ["exec", container, hermesCli, "config", "set", dotted, value]);
}

hermesConfigSet("model.provider", "custom");
hermesConfigSet("model.base_url", base);
hermesConfigSet("model.default", model);
hermesConfigSet("model.api_key", key);

// Write /opt/data/.env for env-based loaders
const envBody = [
  "API_SERVER_ENABLED=true",
  "API_SERVER_HOST=0.0.0.0",
  `API_SERVER_KEY=${cfg.HERMES_API_KEY || ""}`,
  `OPENAI_API_BASE=${base}`,
  `OPENAI_API_KEY=${key}`,
  `OPENAI_BASE_URL=${base}`,
  `DASHSCOPE_API_KEY=${key}`,
  `MODEL_DEFAULT=${model}`,
  "JFO_API_PUBLIC_BASE=http://host.docker.internal:8787",
  `JFO_INTERNAL_KEY=${cfg.JFO_INTERNAL_KEY || ""}`,
  "",
].join("\n");
const tmpEnv = path.join(os.tmpdir(), "jfo-hermes-docker.env");
fs.writeFileSync(tmpEnv, envBody, "utf8");
run("docker", ["cp", tmpEnv, `${container}:/opt/data/.env`]);
fs.unlinkSync(tmpEnv);
log("wrote /opt/data/.env");

// Patch every api_key: line in config.yaml via python (or sed fallback)
const py = `
import os, re, pathlib
p = pathlib.Path('/opt/data/config.yaml')
t = p.read_text(encoding='utf-8')
key = os.environ['JFO_PATCH_KEY']
t2, n = re.subn(r'(?m)^(\\s*api_key:\\s*).*$', lambda m: m.group(1) + key, t, count=5)
p.write_text(t2, encoding='utf-8')
print('patched', n)
`.trim();
const tmpPy = path.join(os.tmpdir(), "jfo-patch-hermes-key.py");
fs.writeFileSync(tmpPy, py, "utf8");
run("docker", ["cp", tmpPy, `${container}:/tmp/jfo-patch-hermes-key.py`]);
fs.unlinkSync(tmpPy);

let patched = false;
for (const pyBin of ["python3", "python"]) {
  const r = spawnSync(
    "docker",
    ["exec", "-e", `JFO_PATCH_KEY=${key}`, container, pyBin, "/tmp/jfo-patch-hermes-key.py"],
    { encoding: "utf8" },
  );
  if (r.status === 0) {
    log(`${pyBin}: ${(r.stdout || "").trim()}`);
    patched = true;
    break;
  }
}
if (!patched) {
  log("python not in image; using sed");
  run("docker", [
    "exec",
    "-e",
    `JFO_PATCH_KEY=${key}`,
    container,
    "sh",
    "-c",
    'sed -i "s#^[[:space:]]*api_key:.*#  api_key: ${JFO_PATCH_KEY}#" /opt/data/config.yaml',
  ]);
}

const check = run("docker", [
  "exec",
  container,
  "sh",
  "-c",
  "grep -n api_key /opt/data/config.yaml | head -5",
]);
log(`api_key lines:\n${check}`);
if (/你的/u.test(check)) {
  die("api_key still contains Chinese placeholder");
}

log(`restarting ${container}...`);
run("docker", ["restart", container]);
log("sleep 15s...");
spawnSync(process.platform === "win32" ? "timeout" : "sleep", process.platform === "win32" ? ["/t", "15", "/nobreak"] : ["15"], {
  shell: true,
  stdio: "ignore",
});

const health = spawnSync("curl", ["-sS", "http://127.0.0.1:8642/health"], {
  encoding: "utf8",
});
if (health.status === 0) log(`health: ${(health.stdout || "").trim()}`);
else log("health check skip (curl failed); try manually");

log("Done. Re-test chat with: 测试skill");
