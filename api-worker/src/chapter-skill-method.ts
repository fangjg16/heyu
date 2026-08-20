import type { AppDatabase } from "./app-database";
import { skillsForChapter } from "./chapter-skill-map";
import { getSkillMdContent } from "./skills-db";

/** 拼进 generate_system：有分析方法时只填待补，不得改 HTML 版式 */
export const GENERATE_SYSTEM_SKILL_LOCK =
  "10. 若用户消息含「分析方法」：只用来填模板中的「待补」；禁止改表头、禁止用分析方法里的示例表替换骨架、禁止改成散文。允许按资料增删数据行。版式以章节 Markdown 模板为准。";

export function stripSkillFrontmatter(raw: string): string {
  const t = String(raw ?? "").replace(/^\uFEFF/, "");
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(t);
  return (m?.[1] ?? t).trim();
}

/** 去掉 YAML 头与触发词行；保留完整方法正文，不再按字数截断 */
export function condenseSkillMarkdown(raw: string): string {
  return stripSkillFrontmatter(raw)
    .replace(/^description:\s*".*?"\s*$/gimu, "")
    .replace(/^Triggers on[^\n]*$/gimu, "")
    .replace(/Use when[^\n]*$/gimu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
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
  const extraLock =
    sectionId === "project-overview"
      ? "综合成熟度只填右上角那一个数或状态词；禁止输出 Factor A/B 分卡、十一段完整度表。"
      : sectionId === "snapshot"
        ? "只填项目范围与交易要点；禁止输出 Factor A/B 分卡、十一段完整度表或综合成熟度表。"
        : sectionId === "questions"
          ? "待确认问题必须用 P1/P2/P3 三组 <details> 折叠卡片，组内 <ol><li>；禁止改成缺口登记大表。"
          : sectionId === "business"
            ? "写目标公司怎么赚钱（客户/定价/单位经济）；禁止 IRR/MOIC/投资人回报。"
            : sectionId === "framework"
              ? "写建议、论点、法律路径、增值杠杆与路线图；禁止 Top5 风险表和三情景 IRR 摘要。"
              : "";
  const lines = [
    "【分析方法 · 只用于填写模板中的「待补」】",
    `本章 ${sectionId} 对应 skill：${parts.map((p) => p.skill).join("、")}。`,
    "禁止改表头或替换【章节 Markdown 模板】，禁止改成 Markdown 散文，禁止用下列方法里的示例表或旧 KB Handoff 替换骨架，禁止改内联 style。允许按资料增删数据行。",
  ];
  if (extraLock) lines.push(extraLock);
  lines.push(
    "缺证据仍写「待补」。版式以【章节 Markdown 模板】和「版式锁定」为准。",
    "知识网络只在网页章节生成；不要写入 [AI]_知识网络.html，不要调用 knowledge-base-generation。",
    "",
    body,
  );
  return lines.join("\n");
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
  const parts: Array<{ skill: string; text: string }> = [];
  for (const skill of skills) {
    const raw = await readSkillMarkdown(db, skill);
    if (!raw?.trim()) continue;
    const text = condenseSkillMarkdown(raw);
    if (text) parts.push({ skill, text });
  }
  return wrapMethodBlock(sectionId, parts);
}
