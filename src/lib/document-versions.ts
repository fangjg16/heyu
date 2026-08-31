/** 与 api-worker/src/document-versions.ts 保持一致。 */

export type VersionedFile = {
  id: string;
  filename: string;
  relativePath?: string | null;
  replacesDocumentId?: string | null;
  versionGroup?: string | null;
  createdAt?: string | null;
};

function pathOf(doc: VersionedFile): string {
  return `${(doc.relativePath ?? "").trim()}/${doc.filename}`;
}

function createdOf(doc: VersionedFile): string {
  return doc.createdAt ?? "";
}

function replacesOf(doc: VersionedFile): string {
  return (doc.replacesDocumentId ?? "").trim();
}

function groupOf(doc: VersionedFile): string {
  return (doc.versionGroup ?? "").trim() || doc.id;
}

export function pickCurrentDocuments<T extends VersionedFile>(docs: T[]): T[] {
  const superseded = new Set(
    docs.map((d) => replacesOf(d)).filter((id) => id.length > 0),
  );
  const byKey = new Map<string, T[]>();
  for (const doc of docs) {
    const key = pathOf(doc);
    const list = byKey.get(key) ?? [];
    list.push(doc);
    byKey.set(key, list);
  }
  const out: T[] = [];
  for (const group of byKey.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const alive = group.filter((d) => !superseded.has(d.id));
    const pool = alive.length > 0 ? alive : group;
    pool.sort((a, b) => createdOf(b).localeCompare(createdOf(a)));
    out.push(pool[0]!);
  }
  return out;
}

export function documentsInVersionFamily<T extends VersionedFile>(
  all: T[],
  current: T,
): T[] {
  const gid = groupOf(current);
  const key = pathOf(current);
  return all
    .filter((d) => groupOf(d) === gid || pathOf(d) === key)
    .sort((a, b) => createdOf(b).localeCompare(createdOf(a)));
}
