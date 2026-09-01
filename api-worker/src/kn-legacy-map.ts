/**
 * 旧 13 格 → 现行投资目录的对照，只服务「库里已经有的正文/草稿」。
 *
 * 允许：打开章节、列表「已有内容」、改写已有稿、把未发布的旧草稿发布到新 id。
 * 禁止：更新本章 / 更新全部 / 新开草案生成 / 生成概览。这些只读写新目录 id。
 */
import { sectionLabel } from "./kn-catalog";

export const MATURE_LEGACY_SECTION_SOURCES: Readonly<
  Record<string, readonly string[]>
> = {
  "project-summary": ["snapshot", "objectives"],
  "industry-competition": ["industry", "benchmarks"],
  "business-technology": ["business"],
  "company-team": ["ownership", "capabilities", "legal"],
  "investment-structure-returns": ["returns"],
  "investment-risks": ["risks"],
  "diligence-gaps": ["questions", "diligence"],
  "investment-conclusion": ["framework"],
};

export function composeLegacyChapterHtml(
  parts: { id: string; label: string; html: string }[],
): string {
  const nonempty = parts.filter((p) => String(p.html ?? "").trim());
  if (nonempty.length === 0) return "";
  if (nonempty.length === 1) return nonempty[0]!.html;
  return nonempty
    .map(
      (p) =>
        `<section data-kn-legacy="${p.id}"><h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#1F2423">${p.label}</h2>${p.html}</section>`,
    )
    .join("\n");
}

export function resolveMappedChapterHtml(
  sectionId: string,
  htmlById: Map<string, string | null | undefined>,
): string {
  const own = String(htmlById.get(sectionId) ?? "").trim();
  if (own) return String(htmlById.get(sectionId) ?? "");
  const sources = MATURE_LEGACY_SECTION_SOURCES[sectionId];
  if (!sources?.length) return "";
  return composeLegacyChapterHtml(
    sources.map((id) => ({
      id,
      label: sectionLabel(id, "mature"),
      html: String(htmlById.get(id) ?? ""),
    })),
  );
}

export function mapHasHtmlFromLegacy(
  sectionId: string,
  htmlById: Map<string, string | null | undefined>,
): boolean {
  return Boolean(resolveMappedChapterHtml(sectionId, htmlById).trim());
}

type DraftLike = {
  sectionId: string;
  html: string | null;
  status: string;
};

/** 把旧 id 草稿并到现行投资章 id；本 id 已有正文则沿用。 */
export function presentMatureDraftItems<T extends DraftLike>(items: T[]): T[] {
  const byId = new Map(items.map((i) => [i.sectionId, i]));
  const extra: T[] = [];
  for (const [newId, sources] of Object.entries(MATURE_LEGACY_SECTION_SOURCES)) {
    const own = byId.get(newId);
    if (own?.html?.trim()) continue;
    const parts: { id: string; label: string; html: string }[] = [];
    let donor: T | null = null;
    for (const oldId of sources) {
      const it = byId.get(oldId);
      if (!it?.html?.trim()) continue;
      parts.push({
        id: oldId,
        label: sectionLabel(oldId, "mature"),
        html: it.html ?? "",
      });
      donor = it;
    }
    const html = composeLegacyChapterHtml(parts);
    if (html && donor) {
      extra.push({ ...donor, sectionId: newId, html, status: "ok" });
    }
  }
  return extra.length ? [...items, ...extra] : items;
}

/** 发布时把旧 13 格条目写到新章 id；新章已有条目则不合并旧稿。 */
export function mergeMatureDraftItemsForPublish<T extends DraftLike>(
  items: T[],
): T[] {
  const ready = items.filter((i) => i.status === "ok" && Boolean(i.html?.trim()));
  const byId = new Map(ready.map((i) => [i.sectionId, i]));
  const out: T[] = [];
  const consumed = new Set<string>();

  for (const [newId, sources] of Object.entries(MATURE_LEGACY_SECTION_SOURCES)) {
    const own = byId.get(newId);
    if (own) {
      out.push(own);
      consumed.add(newId);
      continue;
    }
    const parts: { id: string; label: string; html: string }[] = [];
    let donor: T | null = null;
    for (const oldId of sources) {
      const it = byId.get(oldId);
      if (!it) continue;
      parts.push({
        id: oldId,
        label: sectionLabel(oldId, "mature"),
        html: it.html ?? "",
      });
      donor = it;
      consumed.add(oldId);
    }
    const html = composeLegacyChapterHtml(parts);
    if (html && donor) {
      out.push({ ...donor, sectionId: newId, html });
      consumed.add(newId);
    }
  }

  for (const item of ready) {
    if (consumed.has(item.sectionId)) continue;
    if (MATURE_LEGACY_SECTION_SOURCES[item.sectionId]) {
      out.push(item);
      continue;
    }
    const isLegacySource = Object.values(MATURE_LEGACY_SECTION_SOURCES).some(
      (ids) => ids.includes(item.sectionId),
    );
    if (isLegacySource) continue;
    out.push(item);
  }
  return out;
}
