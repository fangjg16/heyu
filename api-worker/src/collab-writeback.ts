/**
 * 将已确认的项目方答复回写到内部「待确认问题」章节 HTML。
 * 不改风险/估值等其它章节。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

export function buildConfirmedWritebackBlock(input: {
  itemId: string;
  title: string;
  replyText: string;
  fileNames: string[];
  confirmedAt: string;
  confirmedByLabel: string;
}): string {
  const when = input.confirmedAt.replace("T", " ").slice(0, 16);
  const files =
    input.fileNames.length > 0
      ? `<div style="margin:8px 0 0;font-size:12.5px;color:#59625F">附件：${escapeHtml(input.fileNames.join("、"))}</div>`
      : "";
  const reply = input.replyText.trim()
    ? `<div style="margin:8px 0 0;font-size:13px;line-height:1.7">${escapeHtml(input.replyText.trim())}</div>`
    : `<div style="margin:8px 0 0;font-size:13px;color:#59625F">（无文字答复，见附件）</div>`;
  return `<div class="kn-collab-confirmed" data-collab-item="${escapeHtml(input.itemId)}" style="margin:10px 0 14px;padding:10px 12px;border-left:3px solid #5E9B75;background:rgba(94,155,117,0.08)">
  <div style="font-size:12px;font-weight:600;color:#2F6B4F">已对外确认 · ${escapeHtml(input.title)}</div>
  <div style="margin-top:4px;font-size:11.5px;color:#59625F">${escapeHtml(when)} · ${escapeHtml(input.confirmedByLabel)}</div>
  ${reply}
  ${files}
</div>`;
}

export function appendConfirmedAnswerToQuestionsHtml(
  html: string,
  sourceQuestionText: string,
  block: string,
): string {
  const raw = html ?? "";
  const needle = sourceQuestionText.trim();
  if (!needle) {
    return `${raw}\n${block}`;
  }
  if (raw.includes(`data-collab-item=`)) {
    /* 允许同一原题多次确认，始终追加 */
  }

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pRe = new RegExp(
    `(<p\\b[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/p>)`,
    "iu",
  );
  const m = pRe.exec(raw);
  if (m && m.index >= 0) {
    const end = m.index + m[0].length;
    return `${raw.slice(0, end)}\n${block}${raw.slice(end)}`;
  }
  return `${raw.trim()}\n<section class="kn-collab-writeback" style="margin-top:18px">${block}</section>\n`;
}
