import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = path.dirname(fileURLToPath(import.meta.url));
const buildLog = path.join(cwd, 'build-out.txt');
const summary = path.join(cwd, 'VERIFY_SUMMARY.txt');

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: true,
    timeout: 180000,
  });
  return {
    status: r.status === null ? 1 : r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`,
    error: r.error ? String(r.error) : '',
  };
}

let log = '=== START npm run build:production ===\n';
let r = run('npm', ['run', 'build:production']);
log += r.out;
if (r.error) log += `${r.error}\n`;
let exit = r.status;
let wrote = 'no';
let wroteLine = '';
const re = /wrote[^\n]*worker\.mjs[^\n]*/i;
let m = r.out.match(re);
if (m) {
  wrote = 'yes';
  wroteLine = m[0];
}

if (exit !== 0) {
  log += '\n=== FALLBACK node scripts/build-production-bundle.mjs ===\n';
  r = run('node', ['scripts/build-production-bundle.mjs']);
  log += r.out;
  if (r.error) log += `${r.error}\n`;
  exit = r.status;
  m = r.out.match(re);
  if (m) {
    wrote = 'yes';
    wroteLine = m[0];
  }
}

fs.writeFileSync(buildLog, log);
if (wrote === 'no') {
  const lm = log.match(re);
  if (lm) {
    wrote = 'yes';
    wroteLine = lm[0];
  }
}

const worker = path.join(cwd, 'dist', 'worker.mjs');
let contains = 'no';
const errors = [];
if (fs.existsSync(worker)) {
  const txt = fs.readFileSync(worker, 'utf8');
  if (txt.includes('parse-summary')) contains = 'yes';
} else {
  errors.push('dist/worker.mjs missing after build');
}

const status = exit === 0 && contains === 'yes' ? 'SUCCESS' : 'FAILURE';
const report = [
  `STATUS: ${status}`,
  `exit_code: ${exit}`,
  `wrote_dist_worker_mjs: ${wrote}`,
  `wrote_line: ${wroteLine}`,
  `contains_parse-summary: ${contains}`,
  `errors: ${errors.length ? errors.join('; ') : '(none)'}`,
  '',
  '--- build log ---',
  log,
].join('\n');

fs.writeFileSync(summary, report);
console.log(report);
