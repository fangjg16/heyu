/**
 * 知识网络正式版号（整数存储）
 *
 * - 0：未发布
 * - 1–99：0.x（13 个研究章节尚未第一次齐全）
 * - 100–9999：旧编码 major×100+minor（100=1.0，200=2.0）
 * - ≥10000：major×10000 + minor×100 + patch（10000=1.0，10101=1.1.1）
 *
 * 展示时省略为 0 的 patch：1.0.0 → 1.0，1.1.1 保持 1.1.1。
 */

export const RESEARCH_CHAPTER_IDS = [
  "snapshot",
  "objectives",
  "industry",
  "legal",
  "benchmarks",
  "business",
  "returns",
  "capabilities",
  "ownership",
  "diligence",
  "risks",
  "questions",
  "framework",
] as const;

export type ChapterVersionBump = "major" | "minor" | "patch";

export type ParsedChapterVersion = {
  major: number;
  minor: number;
  patch: number;
};

export function parseChapterVersion(
  raw: number | null | undefined,
): ParsedChapterVersion {
  const v = Math.trunc(Number(raw) || 0);
  if (v <= 0) return { major: 0, minor: 0, patch: 0 };
  if (v < 100) return { major: 0, minor: v, patch: 0 };
  if (v < 10_000) {
    return { major: Math.floor(v / 100), minor: v % 100, patch: 0 };
  }
  return {
    major: Math.floor(v / 10_000),
    minor: Math.floor((v % 10_000) / 100),
    patch: v % 100,
  };
}

export function encodeChapterVersion(parts: ParsedChapterVersion): number {
  const major = Math.max(0, Math.trunc(parts.major));
  const minor = Math.max(0, Math.trunc(parts.minor));
  const patch = Math.max(0, Math.trunc(parts.patch));
  if (major <= 0) {
    if (minor <= 0) return 0;
    return Math.min(99, minor);
  }
  return major * 10_000 + Math.min(99, minor) * 100 + Math.min(99, patch);
}

export function formatChapterVersion(
  version: number | null | undefined,
): string {
  const v = Number(version) || 0;
  if (v <= 0) return "未发布";
  const { major, minor, patch } = parseChapterVersion(v);
  if (patch > 0) return `${major}.${minor}.${patch}`;
  return `${major}.${minor}`;
}

export function formatChapterVersionLabel(
  version: number | null | undefined,
): string {
  const formatted = formatChapterVersion(version);
  return formatted === "未发布" ? formatted : `v${formatted}`;
}

/** 读库原值。1–99 表示 0.x，不再当成旧的整数主版本 1/2/3。 */
export function normalizeStoredChapterVersion(
  raw: number | null | undefined,
): number {
  return Math.trunc(Number(raw) || 0);
}

export function isPreReleaseChapterVersion(
  raw: number | null | undefined,
): boolean {
  return parseChapterVersion(raw).major <= 0;
}

export function researchChaptersCompleteFromFlags(
  hasHtml: Record<string, boolean | undefined>,
): boolean {
  return RESEARCH_CHAPTER_IDS.every((id) => Boolean(hasHtml[id]));
}

export function researchChaptersComplete(
  htmlBySection:
    | Record<string, string | null | undefined>
    | Map<string, string | null | undefined>,
): boolean {
  const get = (id: string) =>
    htmlBySection instanceof Map ? htmlBySection.get(id) : htmlBySection[id];
  return RESEARCH_CHAPTER_IDS.every((id) => Boolean((get(id) ?? "").trim()));
}

/**
 * 下一正式版号。
 * 研究章节未齐：0.1、0.2…；第一次齐全：1.0。
 * 已是 1.0+：按 bump 走补丁 / 次版本 / 主版本。
 */
export function nextChapterVersion(
  currentRaw: number | null | undefined,
  options?: { bump?: ChapterVersionBump; allResearchComplete?: boolean },
): number {
  const bump = options?.bump ?? "minor";
  const parsed = parseChapterVersion(currentRaw);
  const complete = Boolean(options?.allResearchComplete);

  if (parsed.major <= 0) {
    if (complete) return encodeChapterVersion({ major: 1, minor: 0, patch: 0 });
    if (parsed.minor <= 0) return 1;
    return Math.min(99, parsed.minor + 1);
  }

  if (bump === "major") {
    return encodeChapterVersion({
      major: parsed.major + 1,
      minor: 0,
      patch: 0,
    });
  }
  if (bump === "patch") {
    if (parsed.patch >= 99) {
      return encodeChapterVersion({
        major: parsed.major,
        minor: parsed.minor + 1,
        patch: 0,
      });
    }
    return encodeChapterVersion({
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch + 1,
    });
  }
  if (parsed.minor >= 99) {
    return encodeChapterVersion({
      major: parsed.major + 1,
      minor: 0,
      patch: 0,
    });
  }
  return encodeChapterVersion({
    major: parsed.major,
    minor: parsed.minor + 1,
    patch: 0,
  });
}

/** 已是 1.0+ 时按 bump 递增；0.x 只往上加 0.x，不会自动升 1.0。 */
export function bumpChapterVersion(
  currentRaw: number | null | undefined,
  kind: ChapterVersionBump = "minor",
): number {
  const parsed = parseChapterVersion(currentRaw);
  return nextChapterVersion(currentRaw, {
    bump: kind,
    allResearchComplete: parsed.major >= 1,
  });
}

export const OVERVIEW_SECTION_ID = "project-overview";

export function formatOverviewVersionLabel(
  version: number | null | undefined,
): string {
  const v = Math.trunc(Number(version) || 0);
  return v > 0 ? `ov-${v}` : "未发布";
}

export function isResearchChapterId(id: string): boolean {
  return (RESEARCH_CHAPTER_IDS as readonly string[]).includes(id);
}

export function primaryPublishSectionIds(ids: string[]): string[] {
  return ids.filter(
    (id) => id !== "sources" && id !== "glossary" && id !== "project-graph",
  );
}

export function isOverviewOnlyPublish(ids: string[]): boolean {
  const primary = primaryPublishSectionIds(ids);
  return (
    primary.length > 0 && primary.every((id) => id === OVERVIEW_SECTION_ID)
  );
}
