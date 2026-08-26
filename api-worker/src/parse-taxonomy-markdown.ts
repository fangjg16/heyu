export type IndustryTheme = {
  theme: string;
  sectors: string[];
};

export type ParsedTaxonomy = {
  version: string;
  themes: IndustryTheme[];
};

export function parseTaxonomyMarkdown(md: string): ParsedTaxonomy {
  const version =
    /版本：\s*(\S+)/u.exec(md)?.[1]?.trim() ??
    /taxonomy_version["']?\s*[:=]\s*["']?([0-9-]+r?\d*)/iu.exec(md)?.[1]?.trim() ??
    "";
  const themes: IndustryTheme[] = [];
  let current: IndustryTheme | null = null;

  for (const rawLine of md.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;

    const numbered = /^##\s+(\d+)\.\s+(.+)$/u.exec(line);
    if (numbered) {
      current = { theme: numbered[2]!.trim(), sectors: [] };
      if (current.theme) themes.push(current);
      continue;
    }

    if (line.startsWith("## ")) {
      current = null;
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/u.exec(line);
    if (!bullet || !current) continue;
    const sector = bullet[1]!.trim();
    if (!sector) continue;
    if (!current.sectors.includes(sector)) current.sectors.push(sector);
  }

  return { version, themes };
}

export const CLASSIFY_THEME_SKILL = "classify-investment-theme";
export const TAXONOMY_MD_PATH = "references/taxonomy.md";
