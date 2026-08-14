/**
 * 章节正式版号编码：major*100 + minor
 * 0 = 尚未发布；100 = 1.0；101 = 1.1；200 = 2.0
 */

export type ChapterVersionBump = "major" | "minor";

export function formatChapterVersion(version: number | null | undefined): string {
  const v = Number(version) || 0;
  if (v <= 0) return "未发布";
  // 兼容迁移前的整数主版本 1、2、3
  if (v > 0 && v < 100) return `${v}.0`;
  const major = Math.floor(v / 100);
  const minor = v % 100;
  return `${major}.${minor}`;
}

export function formatChapterVersionLabel(
  version: number | null | undefined,
): string {
  const formatted = formatChapterVersion(version);
  return formatted === "未发布" ? formatted : `v${formatted}`;
}

/** 规范化读库版本（旧 1/2/3 → 100/200/300） */
export function normalizeStoredChapterVersion(raw: number | null | undefined): number {
  const v = Number(raw) || 0;
  if (v > 0 && v < 100) return v * 100;
  return v;
}

export function bumpChapterVersion(
  currentRaw: number | null | undefined,
  kind: ChapterVersionBump = "minor",
): number {
  const current = normalizeStoredChapterVersion(currentRaw);
  if (current <= 0) return 100; // 首次发布恒为 1.0
  if (kind === "major") return Math.floor(current / 100) * 100 + 100;
  return current + 1;
}
