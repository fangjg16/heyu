/**
 * Hermes skills 列表 / 同步 / 读写（供 mysql-local-bridge 与 skills-bridge 调用）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiWorkerRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(apiWorkerRoot, "..");

export function resolveSkillsPaths(envPick) {
  const pick = (k, fallback = "") => {
    const v = (envPick(k) ?? "").trim();
    return v || fallback;
  };
  const source = path.resolve(
    pick(
      "HERMES_SKILLS_SOURCE",
      path.join(repoRoot, "hermes-railway", "skills"),
    ),
  );
  const installed = path.resolve(
    pick(
      "HERMES_SKILLS_DIR",
      path.join(os.homedir(), ".jfo-local", "hermes", "skills"),
    ),
  );
  const soulSrc = path.resolve(
    pick(
      "HERMES_SOUL_SOURCE",
      path.join(repoRoot, "hermes-railway", "SOUL-JFO-KB.md"),
    ),
  );
  const soulDest = path.resolve(
    pick(
      "HERMES_SOUL_DEST",
      path.join(os.homedir(), ".jfo-local", "hermes", "SOUL.md"),
    ),
  );
  return { source, installed, soulSrc, soulDest, apiWorkerRoot, repoRoot };
}

/** 源与安装为同一路径，或 SKILLS_VOLUME_MODE=1 */
export function isVolumeMode(envPick) {
  if ((envPick("SKILLS_VOLUME_MODE") ?? "").trim() === "1") return true;
  const paths = resolveSkillsPaths(envPick);
  return path.resolve(paths.source) === path.resolve(paths.installed);
}

function assertSafeDir(dir, label) {
  const resolved = path.resolve(dir);
  if (!resolved || resolved === path.parse(resolved).root) {
    throw new Error(`${label} 路径无效`);
  }
  return resolved;
}

function parseSkillTitle(skillMdPath) {
  try {
    const raw = fs.readFileSync(skillMdPath, "utf8");
    const lines = raw.split(/\r?\n/u);
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("#")) {
        return t.replace(/^#+\s*/u, "").trim().slice(0, 200);
      }
      break;
    }
    const m = raw.match(/^name:\s*(.+)$/mu);
    if (m) return m[1].trim().slice(0, 200);
  } catch {
    /* ignore */
  }
  return "";
}

function listSkillDirs(rootDir) {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    return [];
  }
  const names = [];
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".")) continue;
    if (ent.name.includes("_deprecated")) continue;
    const skillMd = path.join(rootDir, ent.name, "SKILL.md");
    if (!fs.existsSync(skillMd)) continue;
    names.push(ent.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export function listSkills(envPick) {
  const paths = resolveSkillsPaths(envPick);
  const source = assertSafeDir(paths.source, "HERMES_SKILLS_SOURCE");
  const installedRoot = assertSafeDir(paths.installed, "HERMES_SKILLS_DIR");
  const volumeMode = isVolumeMode(envPick);
  const sourceNames = listSkillDirs(source);
  const installedNames = volumeMode
    ? new Set(sourceNames)
    : new Set(listSkillDirs(installedRoot));

  const skills = sourceNames.map((name) => {
    const skillMd = path.join(source, name, "SKILL.md");
    return {
      name,
      title: parseSkillTitle(skillMd) || name,
      installed: installedNames.has(name),
      sourcePath: path.join(source, name),
      installedPath: path.join(installedRoot, name),
    };
  });

  return {
    sourceDir: source,
    installedDir: installedRoot,
    sourceExists: fs.existsSync(source),
    installedExists: fs.existsSync(installedRoot),
    volumeMode,
    skills,
  };
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDirRecursive(from, to);
    } else if (ent.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function rmDirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

export function syncSkills(envPick) {
  const paths = resolveSkillsPaths(envPick);
  const source = assertSafeDir(paths.source, "HERMES_SKILLS_SOURCE");
  const installed = assertSafeDir(paths.installed, "HERMES_SKILLS_DIR");
  const volumeMode = isVolumeMode(envPick);

  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Skills 源目录不存在：${source}`);
  }

  if (volumeMode) {
    const names = listSkillDirs(source);
    return {
      ok: true,
      copied: names.length,
      sourceDir: source,
      installedDir: installed,
      soulCopied: false,
      soulDest: null,
      volumeMode: true,
      hint: "已在 Hermes 运行卷上，无需再同步。需要时请重启 Hermes Gateway。",
    };
  }

  const hermesRoot = path.dirname(installed);
  fs.mkdirSync(installed, { recursive: true });
  fs.mkdirSync(path.join(hermesRoot, "kb"), { recursive: true });
  fs.mkdirSync(path.join(hermesRoot, "logs"), { recursive: true });

  const names = listSkillDirs(source);
  let copied = 0;
  for (const name of names) {
    const from = path.join(source, name);
    const to = path.join(installed, name);
    rmDirRecursive(to);
    copyDirRecursive(from, to);
    copied += 1;
  }

  let soulCopied = false;
  if (fs.existsSync(paths.soulSrc)) {
    fs.mkdirSync(path.dirname(paths.soulDest), { recursive: true });
    fs.copyFileSync(paths.soulSrc, paths.soulDest);
    soulCopied = true;
  }

  const checks = [
    path.join(installed, "opportunistic-investments-hermes", "assets", "kb-template.html"),
    path.join(installed, "opportunistic-investments-hermes", "references", "kb-schema.md"),
    path.join(installed, "jfo-r2-materials", "SKILL.md"),
  ];
  for (const f of checks) {
    if (!fs.existsSync(f)) {
      throw new Error(`同步自检失败，缺少：${f}`);
    }
  }
  const html = fs.readFileSync(checks[0], "utf8");
  if (!html.includes("revealAnchor")) {
    throw new Error("同步自检失败：kb-template.html 缺少 revealAnchor");
  }

  return {
    ok: true,
    copied,
    sourceDir: source,
    installedDir: installed,
    soulCopied,
    soulDest: soulCopied ? paths.soulDest : null,
    volumeMode: false,
    hint: "若 Hermes 容器已在运行，建议重启容器以加载最新 skills。",
  };
}

const SKILL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const MAX_SKILL_MD_BYTES = 2 * 1024 * 1024;
const MAX_SKILL_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SKILL_FILES = 500;
const TEXT_EXT_RE =
  /\.(md|markdown|txt|json|ya?ml|html?|css|js|mjs|cjs|ts|tsx|jsx|sh|py|xml|svg|csv|toml|ini|cfg|conf)$/iu;

export function assertSkillName(name) {
  const n = String(name ?? "").trim();
  if (!n || !SKILL_NAME_RE.test(n) || n.includes("..")) {
    throw new Error("无效的 skill 名称");
  }
  return n;
}

export function assertRelPath(relPath) {
  const raw = String(relPath ?? "").trim().replace(/\\/gu, "/");
  if (!raw || raw.startsWith("/") || raw.includes("..")) {
    throw new Error(`无效的相对路径：${relPath}`);
  }
  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === "." || p === "..")) {
    throw new Error(`无效的相对路径：${relPath}`);
  }
  return parts.join("/");
}

function skillsRootForWrite(envPick) {
  const paths = resolveSkillsPaths(envPick);
  const volumeMode = isVolumeMode(envPick);
  const root = assertSafeDir(
    volumeMode ? paths.installed : paths.source,
    volumeMode ? "HERMES_SKILLS_DIR" : "HERMES_SKILLS_SOURCE",
  );
  return { paths, volumeMode, root };
}

function walkSkillFiles(dir, baseRel = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const rel = baseRel ? `${baseRel}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkSkillFiles(full, rel));
    } else if (ent.isFile()) {
      out.push({ rel, full });
    }
  }
  return out;
}

/** 读取卷上整棵 skill 目录（供导入库） */
export function readSkillTree(envPick, skillName) {
  const name = assertSkillName(skillName);
  const { root, volumeMode } = skillsRootForWrite(envPick);
  const dir = path.join(root, name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw Object.assign(new Error(`找不到 skill：${name}`), { status: 404 });
  }
  const walked = walkSkillFiles(dir);
  if (walked.length > MAX_SKILL_FILES) {
    throw new Error(`文件过多（>${MAX_SKILL_FILES}）`);
  }
  const files = walked.map(({ rel, full }) => {
    const buf = fs.readFileSync(full);
    if (buf.length > MAX_SKILL_FILE_BYTES) {
      throw new Error(`文件过大：${rel}（上限 ${MAX_SKILL_FILE_BYTES} 字节）`);
    }
    const isText = TEXT_EXT_RE.test(rel);
    return {
      path: rel,
      contentBase64: buf.toString("base64"),
      isText,
      byteSize: buf.length,
    };
  });
  const title = parseSkillTitle(path.join(dir, "SKILL.md")) || name;
  return { ok: true, name, title, volumeMode, files };
}

/** 用文件树覆盖写技能目录（权威同步落盘） */
export function writeSkillTree(envPick, skillName, filesInput) {
  const name = assertSkillName(skillName);
  const { paths, volumeMode, root } = skillsRootForWrite(envPick);
  if (!Array.isArray(filesInput) || filesInput.length === 0) {
    throw new Error("files 不能为空");
  }
  if (filesInput.length > MAX_SKILL_FILES) {
    throw new Error(`文件过多（上限 ${MAX_SKILL_FILES}）`);
  }

  const normalized = [];
  for (const item of filesInput) {
    const rel = assertRelPath(item.path ?? item.rel_path);
    const b64 =
      typeof item.contentBase64 === "string"
        ? item.contentBase64
        : typeof item.content_b64 === "string"
          ? item.content_b64
          : null;
    if (b64 === null) {
      throw new Error(`缺少 contentBase64：${rel}`);
    }
    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      throw new Error(`无效 base64：${rel}`);
    }
    if (buf.length > MAX_SKILL_FILE_BYTES) {
      throw new Error(`文件过大：${rel}`);
    }
    normalized.push({ rel, buf });
  }

  const hasSkillMd = normalized.some((f) => f.rel === "SKILL.md");
  if (!hasSkillMd) {
    throw new Error("必须包含 SKILL.md");
  }

  const dir = path.join(root, name);
  rmDirRecursive(dir);
  fs.mkdirSync(dir, { recursive: true });

  for (const { rel, buf } of normalized) {
    const dest = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }

  // 非 volume：同时镜像到安装目录
  if (!volumeMode) {
    const installedDir = path.join(paths.installed, name);
    rmDirRecursive(installedDir);
    fs.mkdirSync(installedDir, { recursive: true });
    for (const { rel, buf } of normalized) {
      const dest = path.join(installedDir, ...rel.split("/"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    }
  }

  return {
    ok: true,
    name,
    title: parseSkillTitle(skillMdPath(root, name)) || name,
    fileCount: normalized.length,
    volumeMode,
    hint: VOLUME_HINT,
  };
}

function skillMdPath(root, name) {
  return path.join(root, name, "SKILL.md");
}

const VOLUME_HINT =
  "修改已写入 Hermes 数据卷；需要时请在管理台或 kubectl 重启 Gateway。";

export function readSkillMarkdown(envPick, skillName) {
  const name = assertSkillName(skillName);
  const paths = resolveSkillsPaths(envPick);
  const source = assertSafeDir(paths.source, "HERMES_SKILLS_SOURCE");
  const volumeMode = isVolumeMode(envPick);
  const file = skillMdPath(source, name);
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error(`找不到 skill：${name}`), { status: 404 });
  }
  const content = fs.readFileSync(file, "utf8");
  const installedFile = skillMdPath(paths.installed, name);
  return {
    ok: true,
    name,
    title: parseSkillTitle(file) || name,
    content,
    sourcePath: file,
    installed: volumeMode ? true : fs.existsSync(installedFile),
    syncedContentDiffers: volumeMode
      ? false
      : fs.existsSync(installedFile) &&
        fs.readFileSync(installedFile, "utf8") !== content,
    volumeMode,
  };
}

export function writeSkillMarkdown(envPick, skillName, content, options = {}) {
  const name = assertSkillName(skillName);
  if (typeof content !== "string") {
    throw new Error("content 须为字符串");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_SKILL_MD_BYTES) {
    throw new Error(`SKILL.md 过大（上限 ${MAX_SKILL_MD_BYTES} 字节）`);
  }
  const paths = resolveSkillsPaths(envPick);
  const source = assertSafeDir(paths.source, "HERMES_SKILLS_SOURCE");
  const volumeMode = isVolumeMode(envPick);
  const sourceFile = skillMdPath(source, name);
  if (!fs.existsSync(path.dirname(sourceFile))) {
    throw Object.assign(new Error(`找不到 skill：${name}`), { status: 404 });
  }

  fs.writeFileSync(sourceFile, content, "utf8");

  let mirrored = false;
  if (!volumeMode && options.mirrorInstalled !== false) {
    const installedDir = path.join(paths.installed, name);
    if (fs.existsSync(installedDir)) {
      const installedFile = skillMdPath(paths.installed, name);
      fs.mkdirSync(path.dirname(installedFile), { recursive: true });
      fs.writeFileSync(installedFile, content, "utf8");
      mirrored = true;
    }
  }

  return {
    ok: true,
    name,
    title: parseSkillTitle(sourceFile) || name,
    sourcePath: sourceFile,
    mirrored: volumeMode ? true : mirrored,
    volumeMode,
    hint: volumeMode
      ? VOLUME_HINT
      : mirrored
        ? "已写入源码并镜像到本机 Hermes 安装目录。若容器已在运行，建议重启以加载。"
        : "已写入源码目录。请点击「同步到本机 Hermes」后再重启容器。",
  };
}

function defaultSkillMarkdown(name, title) {
  const t = (title || name).trim() || name;
  return `# ${t}

## 用途

（在此说明该 skill 的适用场景与产出。）

## 步骤

1. …
2. …

## 约束

- 用简体中文回复用户
- 不要暴露内部实现细节
`;
}

export function createSkill(envPick, skillName, options = {}) {
  const name = assertSkillName(skillName);
  const paths = resolveSkillsPaths(envPick);
  const source = assertSafeDir(paths.source, "HERMES_SKILLS_SOURCE");
  const volumeMode = isVolumeMode(envPick);
  const dir = path.join(source, name);
  const file = skillMdPath(source, name);

  if (fs.existsSync(file) || fs.existsSync(dir)) {
    throw Object.assign(new Error(`skill 已存在：${name}`), { status: 409 });
  }

  const content =
    typeof options.content === "string" && options.content.length > 0
      ? options.content
      : defaultSkillMarkdown(name, options.title);
  if (Buffer.byteLength(content, "utf8") > MAX_SKILL_MD_BYTES) {
    throw new Error(`SKILL.md 过大（上限 ${MAX_SKILL_MD_BYTES} 字节）`);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content, "utf8");

  let mirrored = false;
  if (!volumeMode && options.mirrorInstalled !== false) {
    const installedDir = path.join(paths.installed, name);
    fs.mkdirSync(installedDir, { recursive: true });
    fs.writeFileSync(skillMdPath(paths.installed, name), content, "utf8");
    mirrored = true;
  }

  return {
    ok: true,
    name,
    title: parseSkillTitle(file) || name,
    sourcePath: file,
    mirrored: volumeMode ? true : mirrored,
    volumeMode,
    hint: volumeMode
      ? `${VOLUME_HINT} 对话意图映射仍需在代码中配置才会自动命中。`
      : mirrored
        ? "已创建 skill（源码 + 本机安装目录）。若 Hermes 容器已在运行，建议重启以加载；对话意图映射仍需在代码中配置才会自动命中。"
        : "已创建源码目录。请点击「同步到本机 Hermes」后再重启容器。",
  };
}

export function deleteSkill(envPick, skillName, options = {}) {
  const name = assertSkillName(skillName);
  const paths = resolveSkillsPaths(envPick);
  const source = assertSafeDir(paths.source, "HERMES_SKILLS_SOURCE");
  const volumeMode = isVolumeMode(envPick);
  const sourceDir = path.join(source, name);

  if (!fs.existsSync(sourceDir)) {
    throw Object.assign(new Error(`找不到 skill：${name}`), { status: 404 });
  }

  rmDirRecursive(sourceDir);

  let removedInstalled = false;
  if (!volumeMode && options.removeInstalled !== false) {
    const installedDir = path.join(paths.installed, name);
    if (fs.existsSync(installedDir)) {
      rmDirRecursive(installedDir);
      removedInstalled = true;
    }
  } else if (volumeMode) {
    removedInstalled = true;
  }

  return {
    ok: true,
    name,
    removedInstalled,
    volumeMode,
    hint: volumeMode
      ? VOLUME_HINT
      : removedInstalled
        ? "已从源码与本机安装目录删除。若 Hermes 容器已在运行，建议重启。"
        : "已从源码目录删除（安装目录未改动）。",
  };
}
