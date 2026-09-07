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
