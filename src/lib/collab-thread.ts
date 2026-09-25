import type { CollabItem } from "@/lib/project-api";

const LEGACY_FOLLOW_UP =
  /^补充问询｜([^\n]+)\n原答复：([\s\S]*)$/u;

function legacyParent(item: CollabItem, all: CollabItem[], seen: Set<string>): CollabItem | null {
  const raw = item.sourceQuestionText?.trim() ?? "";
  const matched = LEGACY_FOLLOW_UP.exec(raw);
  if (!matched) return null;
  const title = matched[1].trim();
  const reply = matched[2].trim();
  return (
    all.find(
      (row) =>
        !seen.has(row.id) &&
        row.title.trim() === title &&
        (row.replyText ?? "").trim() === reply,
    ) ?? null
  );
}

/** 从旧到新，不含当前这条。用来在展开时串回原来的提问和答复。 */
export function collabPriorTurns(item: CollabItem, all: CollabItem[]): CollabItem[] {
  const byId = new Map(all.map((row) => [row.id, row]));
  const priors: CollabItem[] = [];
  const seen = new Set<string>([item.id]);
  let cursor: CollabItem | undefined = item;
  while (cursor && priors.length < 12) {
    const parentId: string = cursor.parentItemId?.trim() ?? "";
    const parent: CollabItem | undefined = parentId
      ? byId.get(parentId)
      : legacyParent(cursor, all, seen) ?? undefined;
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    priors.push(parent);
    cursor = parent;
  }
  return priors.reverse();
}

/** 同一条问答只展示最新一张卡片。已被补充问询接上的旧卡不再单独占「已回复」。 */
export function collabThreadLeaves<T extends CollabItem>(items: T[]): T[] {
  const superseded = new Set<string>();
  for (const item of items) {
    if (item.status === "draft" || item.status === "discarded") continue;
    for (const prior of collabPriorTurns(item, items)) superseded.add(prior.id);
  }
  return items.filter((item) => !superseded.has(item.id));
}
