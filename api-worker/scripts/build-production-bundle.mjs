/**
 * K8s / 生产镜像构建：将 Worker TypeScript 打成单文件 JS，供 Miniflare 加载。
 * 本地可加 --watch：改 src 后自动重编 dist/worker.mjs。
 *
 *   node scripts/build-production-bundle.mjs
 *   node scripts/build-production-bundle.mjs --watch
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, "dist");
const outfile = path.join(outdir, "worker.mjs");
const watch = process.argv.includes("--watch");

fs.mkdirSync(outdir, { recursive: true });

const buildOptions = {
  entryPoints: [path.join(root, "src/index.ts")],
  bundle: true,
  outfile,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["worker", "browser", "module", "main"],
  conditions: ["workerd", "worker", "browser"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log(`[build:production] watching src → ${outfile}`);
} else {
  await esbuild.build(buildOptions);
  console.log(`[build:production] wrote ${outfile}`);
}
