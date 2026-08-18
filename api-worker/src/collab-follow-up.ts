export type CollabFollowUpSuggest = {
  complete: boolean;
  completeness: string;
  shouldFollowUp: boolean;
  followUpAdvice: string;
  title: string;
  body: string;
};

function extractJsonObject(raw: string): unknown | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/iu.exec(t);
  const body = (fence?.[1] ?? t).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function asBool(v: unknown, extraTrue: string[]): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  if (["false", "0", "no", "否", "不", "无"].includes(s)) return false;
  if (["true", "1", "yes", "是"].includes(s)) return true;
  return extraTrue.some((x) => x.toLowerCase() === s);
}

export function parseCollabFollowUpSuggest(
  raw: string,
): CollabFollowUpSuggest | null {
  const obj = extractJsonObject(raw);
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const completeness = String(o.completeness ?? "").trim();
  const followUpAdvice = String(
    o.followUpAdvice ?? o.advice ?? "",
  ).trim();
  const title = String(o.title ?? "").trim().slice(0, 80);
  const body = String(o.body ?? o.content ?? "").trim();
  if (!completeness && !followUpAdvice && !title && !body) return null;
  return {
    complete: asBool(o.complete, ["完整"]),
    completeness,
    shouldFollowUp: asBool(o.shouldFollowUp ?? o.needFollowUp, [
      "建议补充",
      "需要",
      "需补充",
    ]),
    followUpAdvice,
    title,
    body,
  };
}

export const COLLAB_FOLLOW_UP_SYSTEM = `你评估项目协作方对投资团队问询的书面答复。
只输出一个 JSON 对象，不要 markdown，不要其它说明。字段：
complete: 答复是否已覆盖问询要点（boolean）
completeness: 一两句说明完整或不完整之处
shouldFollowUp: 是否建议再发补充问询（boolean）
followUpAdvice: 一两句说明要不要补充、补什么
title: 补充问询的对外中性标题；若不建议补充可空
body: 补充问询需确认的具体内容；若不建议补充可空
语气中性，不写投资判断。`;

function clip(text: string, max = 4000): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function buildCollabFollowUpUserPrompt(input: {
  title: string;
  body: string;
  replyText: string;
  fileNames: string[];
}): string {
  const files =
    input.fileNames.length > 0 ? input.fileNames.join("、") : "无";
  return [
    `原问询标题：${clip(input.title, 200)}`,
    `原问询内容：${clip(input.body)}`,
    `协作方答复：${clip(input.replyText) || "（空）"}`,
    `已附文件：${files}`,
  ].join("\n");
}
