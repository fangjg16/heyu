import type { AppDatabase } from "./app-database";
import type { AnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";
import {
  SKILL_REFERENCE_FILES,
  skillsForChapter,
} from "./chapter-skill-map";
import { getSkillFileText, getSkillMdContent } from "./skills-db";

/** 拼进 generate_system：有分析方法时只填待补，不得改 HTML 版式 */
export const GENERATE_SYSTEM_SKILL_LOCK =
  "11. 若用户消息含「分析方法」：只用来填模板中的「待补」；禁止改表头、禁止用分析方法里的示例表替换骨架、禁止改成散文。允许按资料增删数据行。版式以章节 Markdown 模板为准。";

const MAX_SKILL_CHARS = 9000;

export function stripSkillFrontmatter(raw: string): string {
  const t = String(raw ?? "").replace(/^\uFEFF/, "");
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(t);
  return (m?.[1] ?? t).trim();
}

const DROP_SKILL_H2 =
  /^(output format|kb handoff|handoff|边界案例提醒|auto-trigger conditions)(\b|\s|$|\()/iu;

function splitMarkdownH2(
  md: string,
): Array<{ title: string; body: string }> {
  const parts = md.split(/^(?=## )/mu);
  return parts
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return null;
      const m = /^## ([^\n]+)\r?\n?([\s\S]*)$/u.exec(trimmed);
      if (!m) return { title: "", body: trimmed };
      return { title: (m[1] ?? "").trim(), body: (m[2] ?? "").trim() };
    })
    .filter((s): s is { title: string; body: string } => Boolean(s));
}

/** 网页生成不会去网上搜；去掉「去哪个网站查」的目录表，保留分析方法表。 */
function stripPublicSourceTables(md: string): string {
  return md.replace(
    /(^|\n)(\|[^\n]+\|\r?\n\|[-:| ]+\|\r?\n(?:\|[^\n]+\|\r?\n)*)/gu,
    (full, lead: string, table: string) => {
      const header = (table.split(/\r?\n/u)[0] ?? "").replace(/\|/gu, " ");
      const isCatalog =
        /\bSources\b/u.test(header) &&
        /Jurisdiction|China Sources|Overseas Sources|Sources \(China\)|Sources \(Overseas\)|\bSector\b/iu.test(
          header,
        );
      return isCatalog ? lead : full;
    },
  );
}

function clipMethod(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_SKILL_CHARS) return t;
  return `${t.slice(0, MAX_SKILL_CHARS).trim()}\n\n（方法已截断，以上足够填写本章。）`;
}

/** 去掉 YAML / Handoff / 公开检索目录；只留 Workflow 等方法步骤。 */
export function condenseSkillMarkdown(raw: string): string {
  let t = stripSkillFrontmatter(raw)
    .replace(/^description:\s*".*?"\s*$/gimu, "")
    .replace(/^Triggers on[^\n]*$/gimu, "")
    .replace(/^Use when[^\n]*$/gimu, "");
  t = t.replace(/```[\s\S]*?---KB-HANDOFF---[\s\S]*?---END-HANDOFF---[\s\S]*?```/gu, "");
  t = t.replace(/---KB-HANDOFF---[\s\S]*?---END-HANDOFF---/gu, "");
  t = t.replace(/^> \*\*v2\.\d[\s\S]*?(?=\n## |\n# |\n*$)/mu, "");
  t = t.replace(
    /Read `?\.\.\/\.\.\/references\/[^`\s]+`?/giu,
    "（说明书已由服务端附在本块中，不要再打开相对路径。）",
  );

  const kept = splitMarkdownH2(t).filter((section) => {
    if (!section.title) return true;
    const heading = section.title.replace(/\(legacy[^)]*\)/giu, "").trim();
    return !DROP_SKILL_H2.test(heading);
  });
  t = kept
    .map((section) =>
      section.title
        ? `## ${section.title}\n${section.body}`.trim()
        : section.body,
    )
    .join("\n\n");
  t = stripPublicSourceTables(t);
  return clipMethod(t.replace(/\n{3,}/gu, "\n\n").trim());
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
      : sectionId === "project-summary" || sectionId === "snapshot"
        ? "只填项目范围与交易要点；禁止输出 Factor A/B 分卡、十一段完整度表或综合成熟度表。"
            : sectionId === "diligence-gaps" ||
            sectionId === "open-items-exceptions" ||
            sectionId === "questions" ||
            sectionId === "assumptions-tracker"
          ? "待确认问题必须用 P1/P2/P3 三组 <details> 折叠卡片，组内 <ol><li>；禁止改成缺口登记大表。"
          : sectionId === "business-technology" ||
              sectionId === "business-worth-buying" ||
              sectionId === "business" ||
              sectionId === "lean-business-model"
            ? "写目标公司怎么赚钱（客户/定价/单位经济）；禁止 IRR/MOIC/投资人回报。模板里只有一张画布，禁止再叠一套九格。"
            : sectionId === "industry-competition" ||
                sectionId === "market-analysis" ||
                sectionId === "industry-trends" ||
                sectionId === "industry"
              ? "写市场切法、政策、与标的咬合、红黄旗；禁止对战卡和出价区间。"
              : sectionId === "projections" ||
                  sectionId === "revenue-model" ||
                  sectionId === "cost-structure" ||
                  sectionId === "financials"
                ? "写跑道、收入与成本假设；禁止 IRR/MOIC/投资人三情景。"
              : sectionId === "investment-conclusion" ||
                  sectionId === "recommendation-conditions" ||
                  sectionId === "framework"
                ? "写建议、论点、法律路径、增值杠杆与路线图；禁止 Top5 风险表和三情景 IRR 摘要。"
                : "";
  const lines = [
    "【分析方法 · 只用于填写模板中的「待补」】",
    `本章 ${sectionId} 对应 skill：${parts.map((p) => p.skill).join("、")}。`,
    "禁止改表头或替换【章节 Markdown 模板】，禁止改成 Markdown 散文，禁止用下列方法里的示例表或旧 KB Handoff 替换骨架，禁止改内联 style。允许按资料增删数据行。",
    "网页生成不上网检索；方法里的搜索步骤改为组织已有附件中的事实。",
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

async function readSkillFile(
  db: AppDatabase | undefined,
  skill: string,
  relPath: string,
): Promise<string | null> {
  const rel = relPath.replace(/^\/+/u, "");
  if (db) {
    try {
      const fromDb =
        rel === "SKILL.md"
          ? await getSkillMdContent(db, skill)
          : await getSkillFileText(db, skill, rel);
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
          rel,
        ),
      );
    }
    if (cwd) {
      candidates.push(
        path.resolve(cwd, "hermes-railway/skills", skill, rel),
        path.resolve(cwd, "../hermes-railway/skills", skill, rel),
      );
    }
    candidates.push(path.join("/opt/data/skills", skill, rel));
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

async function loadSkillParts(
  skillNames: readonly string[],
  db?: AppDatabase,
): Promise<Array<{ skill: string; text: string }>> {
  const parts: Array<{ skill: string; text: string }> = [];
  for (const skill of skillNames) {
    const chunks: string[] = [];
    const main = await readSkillFile(db, skill, "SKILL.md");
    if (main?.trim()) chunks.push(condenseSkillMarkdown(main));
    for (const extra of SKILL_REFERENCE_FILES[skill] ?? []) {
      const raw = await readSkillFile(db, skill, extra);
      if (!raw?.trim()) continue;
      chunks.push(condenseSkillMarkdown(raw));
    }
    const text = chunks.filter(Boolean).join("\n\n").trim();
    if (text) parts.push({ skill, text: clipMethod(text) });
  }
  return parts;
}

function wrapMarkdownFileMethodBlock(
  fileId: string,
  parts: Array<{ skill: string; text: string }>,
): string {
  if (parts.length === 0) return "";
  const body = parts
    .map((p) => `## ${p.skill}\n${p.text}`.trim())
    .join("\n\n")
    .trim();
  if (!body) return "";
  return [
    "【撰写方法】",
    `本文件 ${fileId} 对应 skill：${parts.map((p) => p.skill).join("、")}。`,
    "按方法组织项目事实，输出 Markdown 总文件，不是知识网络 HTML，不要标记分段，不要完整页面。",
    "网页生成不上网检索；方法里的搜索步骤改为组织已有附件中的事实。",
    "缺证据写「待补」。禁止编造。创业财务不要 IRR / 投资人三情景。市场规模写总市场 / 可服务市场 / 可获得份额。",
    "",
    body,
  ].join("\n");
}

/** 生成提示词中的分析方法块；读不到 skill 时返回空串，不阻断生成 */
export async function buildChapterSkillMethodBlock(
  sectionId: string,
  db?: AppDatabase,
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): Promise<string> {
  const skills = skillsForChapter(sectionId, kind);
  if (skills.length === 0) return "";
  return wrapMethodBlock(sectionId, await loadSkillParts(skills, db));
}

/** 资料包 Markdown 总文件用的 skill 方法（输出 md，不是 HTML 模板） */
export async function buildFileSkillMethodBlock(
  fileId: string,
  skillNames: readonly string[],
  db?: AppDatabase,
): Promise<string> {
  if (skillNames.length === 0) return "";
  return wrapMarkdownFileMethodBlock(
    fileId,
    await loadSkillParts(skillNames, db),
  );
}
