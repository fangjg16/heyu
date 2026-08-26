import type { AppDatabase } from "./app-database";
import {
  CLASSIFY_THEME_SKILL,
  parseTaxonomyMarkdown,
  TAXONOMY_MD_PATH,
} from "./parse-taxonomy-markdown";
import { getSkillFileText } from "./skills-db";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** 登录用户可读分类白名单（项目创建/编辑下拉）。管理员改 taxonomy.md 后无需发版即可生效。 */
export async function handleGetTaxonomy(env: {
  DB: AppDatabase;
}): Promise<Response> {
  try {
    const md = await getSkillFileText(
      env.DB,
      CLASSIFY_THEME_SKILL,
      TAXONOMY_MD_PATH,
    );
    if (!md?.trim()) {
      return json({
        ok: true,
        source: "empty",
        version: "",
        themes: [],
      });
    }
    const parsed = parseTaxonomyMarkdown(md);
    return json({
      ok: true,
      source: "skill",
      version: parsed.version,
      themes: parsed.themes,
    });
  } catch {
    return json({
      ok: true,
      source: "empty",
      version: "",
      themes: [],
    });
  }
}
