import type { AppDatabase } from "./app-database";
import { skillsForChapter } from "./chapter-skill-map";
import { getSkillMdContent } from "./skills-db";

const PER_SKILL_MAX = 2_000;
const TOTAL_MAX = 3_600;

/** 拼进 generate_system：有分析方法时只填待补，不得改 HTML 版式 */
export const GENERATE_SYSTEM_SKILL_LOCK =
  "10. 若用户消息含「分析方法」：只用来填模板中的「待补」；禁止按分析方法改 HTML 骨架、加列、改成散文或替换模板表。版式仍以章节 Markdown 模板为准。";

export function stripSkillFrontmatter(raw: string): string {
  const t = String(raw ?? "").replace(/^\uFEFF/, "");
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(t);
  return (m?.[1] ?? t).trim();
}

/** 去掉触发词/过长示例，截到行边界，避免冲掉 MD 版式锁 */
export function condenseSkillMarkdown(
  raw: string,
  maxChars = PER_SKILL_MAX,
): string {
  let t = stripSkillFrontmatter(raw);
  t = t
    .replace(/^description:\s*".*?"\s*$/gimu, "")
    .replace(/^Triggers on[^\n]*$/gimu, "")
    .replace(/Use when[^\n]*$/gimu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const nl = cut.lastIndexOf("\n");
  return `${(nl > maxChars * 0.6 ? cut.slice(0, nl) : cut).trim()}\n…（方法已截断，版式仍以章节模板为准）`;
}

function wrapMethodBlock(
  sectionId: string,
  parts: Array<{ skill: string; text: string }>,
): string {
  if (parts.length === 0) return "";
  const body = parts
    .map((p) => `## ${p.skill}\n${p.text}`.trim())
    .join("\n\n")
    .trim();
  if (!body) return "";
  let clipped = body;
  if (clipped.length > TOTAL_MAX) {
    const cut = clipped.slice(0, TOTAL_MAX);
    const nl = cut.lastIndexOf("\n");
    clipped = `${(nl > TOTAL_MAX * 0.6 ? cut.slice(0, nl) : cut).trim()}\n…`;
  }
  return [
    "【分析方法 · 只用于填写模板中的「待补」】",
    `本章 ${sectionId} 对应 skill：${parts.map((p) => p.skill).join("、")}。`,
    "禁止增加模板外的章节或表格列，禁止改成 Markdown 散文，禁止用下列方法里的示例表替换【章节 Markdown 模板】，禁止改内联 style。",
    "缺证据仍写「待补」。版式以【章节 Markdown 模板】和「版式锁定」为准。",
    "",
    clipped,
  ].join("\n");
}

async function readSkillMarkdown(
  db: AppDatabase | undefined,
  skill: string,
): Promise<string | null> {
  if (db) {
    try {
      const fromDb = await getSkillMdContent(db, skill);
      if (fromDb?.trim()) return fromDb;
    } catch {
      /* 表未迁移或未种子时走仓库文件 */
    }
  }
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const metaUrl = (import.meta as { url?: string }).url;
    const cwd = (
      globalThis as { process?: { cwd?: () => string } }
    ).process?.cwd?.();
    const candidates: string[] = [];
    if (metaUrl) {
      candidates.push(
        path.resolve(
          path.dirname(fileURLToPath(metaUrl)),
          "../../hermes-railway/skills",
          skill,
          "SKILL.md",
        ),
      );
    }
    if (cwd) {
      candidates.push(
        path.resolve(cwd, "hermes-railway/skills", skill, "SKILL.md"),
        path.resolve(cwd, "../hermes-railway/skills", skill, "SKILL.md"),
      );
    }
    candidates.push(path.join("/opt/data/skills", skill, "SKILL.md"));
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, "utf8");
        if (text.trim()) return text;
      }
    }
  } catch {
    /* Worker 无 fs 时忽略 */
  }
  return null;
}

/** 生成提示词中的分析方法块；读不到 skill 时返回空串，不阻断生成 */
export async function buildChapterSkillMethodBlock(
  sectionId: string,
  db?: AppDatabase,
): Promise<string> {
  const skills = skillsForChapter(sectionId);
  if (skills.length === 0) return "";
  const per = skills.length > 1 ? 1_800 : PER_SKILL_MAX;
  const parts: Array<{ skill: string; text: string }> = [];
  for (const skill of skills) {
    const raw = await readSkillMarkdown(db, skill);
    if (!raw?.trim()) continue;
    const text = condenseSkillMarkdown(raw, per);
    if (text) parts.push({ skill, text });
  }
  return wrapMethodBlock(sectionId, parts);
}
