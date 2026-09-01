/** 资料包 Markdown 总文件：拒收回执、确认是正文。 */

export function extractMarkdownBody(answer: string): string {
  const t = answer.trim();
  const fenced = /```(?:markdown|md)?\s*\n([\s\S]*?)```/iu.exec(t);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return t.replace(/^===CHAPTER===\s*/u, "").trim();
}

export function isWriteReceiptMarkdown(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  const pathHit =
    /[`「『]?(AI生成|AI\s*生成)\s*\/[^\n`]{3,}/u.test(t) ||
    /startup\/\d{2}-[a-z-]+\/[\w.-]+\.md/iu.test(t);
  const written =
    /已写[入完成本了]|已经写入|文件已写入|已保存到|写完[。.]/u.test(t);
  const nextLayer = /下一层知识网络|填[写]章节模板|章节模板/u.test(t);
  const kbSize = /\(\s*\d+(?:\.\d+)?\s*KB\s*\)/iu.test(t);
  if (pathHit && written) return true;
  if (written && nextLayer) return true;
  if (pathHit && nextLayer) return true;
  if (written && kbSize) return true;
  if (t.length < 1600 && written && /覆盖[：:]/u.test(t)) return true;
  return false;
}

export function looksLikeMarkdownFile(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 400) return false;
  if (isWriteReceiptMarkdown(t)) return false;
  if (/^深度分析失败/.test(t)) return false;
  if (/class=["']kn-/iu.test(t) && /<table/iu.test(t)) return false;
  const hasHeading = /^#{1,3}\s+\S/mu.test(t);
  const hasTable = /^\|.+\|/mu.test(t);
  return hasHeading || (hasTable && t.length >= 800);
}

export const FILE_WRITE_RETRY_HINT = `上次回复不是正文，而是「已写入某路径」之类的说明。请重新输出完整 Markdown 分析，第一行必须是 # 或 ## 标题。禁止提及路径、已写入、KB、章节模板、下一层怎么用。`;
