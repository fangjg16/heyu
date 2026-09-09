export type SkillFileNode =
  | { kind: "dir"; name: string; path: string; children: SkillFileNode[] }
  | { kind: "file"; name: string; path: string };

function sortNodes(a: SkillFileNode, b: SkillFileNode): number {
  if (a.kind !== b.kind) return a.kind === "file" ? -1 : 1;
  if (a.kind === "file" && a.name === "SKILL.md") return -1;
  if (b.kind === "file" && b.name === "SKILL.md") return 1;
  return a.name.localeCompare(b.name);
}

/** 把 skill 内相对路径收成可展开的目录树。 */
export function skillFilePathsToTree(paths: string[]): SkillFileNode[] {
  type DirAcc = {
    kind: "dir";
    name: string;
    path: string;
    children: SkillFileNode[];
    dirs: Map<string, DirAcc>;
  };
  const root: DirAcc = {
    kind: "dir",
    name: "",
    path: "",
    children: [],
    dirs: new Map(),
  };

  const ensureDir = (parent: DirAcc, name: string): DirAcc => {
    let next = parent.dirs.get(name);
    if (!next) {
      const path = parent.path ? `${parent.path}/${name}` : name;
      next = { kind: "dir", name, path, children: [], dirs: new Map() };
      parent.dirs.set(name, next);
    }
    return next;
  };

  for (const raw of paths) {
    const path = raw.replace(/^\/+/u, "").trim();
    if (!path || path.includes("..")) continue;
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor = ensureDir(cursor, parts[i]!);
    }
    const name = parts[parts.length - 1]!;
    cursor.children.push({ kind: "file", name, path });
  }

  const freeze = (dir: DirAcc): SkillFileNode[] => {
    const nested = [...dir.dirs.values()].map((child) => ({
      kind: "dir" as const,
      name: child.name,
      path: child.path,
      children: freeze(child),
    }));
    return [...dir.children, ...nested].sort(sortNodes);
  };

  return freeze(root);
}
