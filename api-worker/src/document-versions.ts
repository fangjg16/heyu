/** 同源版本：树默认只显示当前一份，知识网络只吃当前版。 */

export type VersionedDoc = {
  id: string;
  filename: string;
  relativePath?: string | null;
  relative_path?: string | null;
  replacesDocumentId?: string | null;
  replaces_document_id?: string | null;
  versionGroup?: string | null;
  version_group?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

function pathOf(doc: VersionedDoc): string {
  const rel = (doc.relativePath ?? doc.relative_path ?? "").trim();
  return `${rel}/${doc.filename}`;
}

function createdOf(doc: VersionedDoc): string {
  return doc.createdAt ?? doc.created_at ?? "";
}

function replacesOf(doc: VersionedDoc): string {
  return (doc.replacesDocumentId ?? doc.replaces_document_id ?? "").trim();
}

function groupOf(doc: VersionedDoc): string {
  return (doc.versionGroup ?? doc.version_group ?? "").trim() || doc.id;
}

export function documentPathKey(relativePath: string, filename: string): string {
  return `${(relativePath ?? "").trim()}/${filename}`;
}

/** 同一路径只留当前一份：未被其它行 replaces，同组取最新。 */
export function pickCurrentDocuments<T extends VersionedDoc>(docs: T[]): T[] {
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

export function documentsInVersionFamily<T extends VersionedDoc>(
  all: T[],
  current: T,
): T[] {
  const gid = groupOf(current);
  const key = pathOf(current);
  return all
    .filter((d) => groupOf(d) === gid || pathOf(d) === key)
    .sort((a, b) => createdOf(b).localeCompare(createdOf(a)));
}
