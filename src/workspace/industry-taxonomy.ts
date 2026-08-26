/**
 * 行业分类：一级分类 / 二级分类。
 * 存库格式：`一级分类 / 二级分类`；未选时为「未分类」。
 * 白名单来自 taxonomy.md；表单允许输入白名单之外的自定义分类。
 */

import taxonomyMd from "@/workspace/taxonomy.md?raw";
import {
  parseTaxonomyMarkdown,
  type IndustryTheme,
} from "@/workspace/parse-taxonomy-markdown";

export type { IndustryTheme };

const parsedBundled = parseTaxonomyMarkdown(taxonomyMd);

export const TAXONOMY_VERSION = parsedBundled.version;

export const INDUSTRY_TAXONOMY: IndustryTheme[] =
  parsedBundled.themes.length > 0 ? parsedBundled.themes : [];

export const UNCATEGORIZED_LABEL = "未分类";

export function formatIndustryCategory(theme: string, sector: string): string {
  const t = theme.trim();
  const s = sector.trim();
  if (!t) return UNCATEGORIZED_LABEL;
  if (!s) return t;
  return `${t} / ${s}`;
}

/** 卡片展示：一级 - 二级（二级内部的 / 仍保留） */
export function displayIndustryCategory(raw: string | null | undefined): string {
  const parsed = parseIndustryCategory(raw);
  if (parsed.theme && parsed.sector) return `${parsed.theme} - ${parsed.sector}`;
  if (parsed.theme) return parsed.theme;
  const value = String(raw ?? "").trim();
  if (!value || value === UNCATEGORIZED_LABEL) return value;
  const idx = value.indexOf(" / ");
  if (idx > 0) {
    return `${value.slice(0, idx).trim()} - ${value.slice(idx + 3).trim()}`;
  }
  return value;
}

export function parseIndustryCategory(
  raw: string | null | undefined,
  taxonomy: IndustryTheme[] = INDUSTRY_TAXONOMY,
): {
  theme: string;
  sector: string;
  /** 能拆出一级/二级，但不在当前白名单 */
  custom: boolean;
} {
  const value = String(raw ?? "").trim();
  if (!value || value === UNCATEGORIZED_LABEL) {
    return { theme: "", sector: "", custom: false };
  }

  const knownTheme = taxonomy.find((item) => item.theme === value);
  if (knownTheme) return { theme: value, sector: "", custom: false };

  const spaced = value.indexOf(" / ");
  if (spaced > 0) {
    const theme = value.slice(0, spaced).trim();
    const sector = value.slice(spaced + 3).trim();
    const known = taxonomy.find((item) => item.theme === theme);
    const inList = Boolean(known && known.sectors.includes(sector));
    return { theme, sector, custom: !inList };
  }

  return { theme: value, sector: "", custom: true };
}

export function sectorsForTheme(
  theme: string,
  taxonomy: IndustryTheme[] = INDUSTRY_TAXONOMY,
): string[] {
  return taxonomy.find((item) => item.theme === theme)?.sectors ?? [];
}

export function isKnownTheme(
  theme: string,
  taxonomy: IndustryTheme[] = INDUSTRY_TAXONOMY,
): boolean {
  const t = theme.trim();
  return Boolean(t && taxonomy.some((item) => item.theme === t));
}

export function isKnownSector(
  theme: string,
  sector: string,
  taxonomy: IndustryTheme[] = INDUSTRY_TAXONOMY,
): boolean {
  const s = sector.trim();
  if (!s) return true;
  return sectorsForTheme(theme, taxonomy).includes(s);
}
