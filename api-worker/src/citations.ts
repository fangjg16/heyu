/** 各项目引用槽位：回答中的 [ID:n] 对应展示名与前端颜色 */
export type CitationSlot = {
  id: string;
  title: string;
  color: "purple" | "green" | "blue" | "yellow" | "gray";
};

export function getCitationSlots(_projectId: string): CitationSlot[] {
  return [];
}

export function citationMapFromSlots(slots: CitationSlot[]): Record<string, string> {
  return Object.fromEntries(slots.map((s) => [s.id, s.title]));
}

export function buildCitationSystemLines(slots: CitationSlot[]): string {
  if (slots.length === 0) {
    return "本项目暂无预置引用编号；若资料摘录中有 [ID:n]，请与摘录标题一致。";
  }
  return slots.map((s) => `[ID:${s.id}] ${s.title}`).join("\n");
}

/** 按上传文件名对齐已有引用槽（勿用检索结果下标硬套 [ID:1][ID:2]） */
export function matchCitationSlot(
  slots: CitationSlot[],
  filename: string,
): CitationSlot | undefined {
  if (!filename || slots.length === 0) return undefined;
  const f = filename.toLowerCase().replace(/\s+/gu, "");

  for (const slot of slots) {
    const core = slot.title
      .replace(/[《》]/gu, "")
      .replace(/\.pdf$/iu, "")
      .toLowerCase()
      .replace(/\s+/gu, "");
    if (core.length >= 4 && (f.includes(core) || core.includes(f.replace(/\.pdf$/iu, "")))) {
      return slot;
    }
  }

  return undefined;
}
