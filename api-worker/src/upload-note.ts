/**
 * documents.upload_note 只给人看、给生成用的说明。
 * 历史上曾把内部键（agent_job:… / startup_interview:… / seed:…）写进这一列；
 * 界面和生成都当成没有说明。是否同一篇文件只靠路径 + 文件名 + 版本链。
 */
const INTERNAL_UPLOAD_NOTE_PREFIX =
  /^(agent_job|startup_interview|seed):/iu;

export function humanUploadNote(
  note: string | null | undefined,
): string | null {
  const text = (note ?? "").trim();
  if (!text) return null;
  if (INTERNAL_UPLOAD_NOTE_PREFIX.test(text)) return null;
  return text;
}

/** 检索/点名文件时把说明拼进文件名，方便对上「对赌协议」「2024 审计」。 */
export function documentNameBlob(
  filename: string,
  uploadNote?: string | null,
): string {
  const note = humanUploadNote(uploadNote);
  return [filename.trim(), note].filter(Boolean).join(" ");
}

/** 来源表「摘录/说明」列：人写的说明优先，没有再用解析摘要。 */
export function sourceRemark(
  uploadNote?: string | null,
  fallback?: string | null,
): string {
  return (humanUploadNote(uploadNote) ?? (fallback ?? "").trim()).slice(0, 180);
}
