import type { ProjectFileRecord } from "@/lib/project-api";
import { DIRECTORY_MIME } from "@/lib/project-api";

export type FileTreeFileNode = {
  kind: "file";
  id: string;
  name: string;
  relativePath: string;
  file: ProjectFileRecord;
};

export type FileTreeFolderNode = {
  kind: "folder";
  /** 完整相对路径，如 报告/2024 */
  path: string;
  name: string;
  children: FileTreeNode[];
  /** 该文件夹下的 .keep 占位（若有） */
  markerIds: string[];
};

export type FileTreeNode = FileTreeFileNode | FileTreeFolderNode;

export function normalizeRelativePath(raw: string | null | undefined): string {
  let p = String(raw ?? "")
    .replace(/\\/gu, "/")
    .trim();
  if (!p) return "";
  if (p.startsWith("/") || /^[a-zA-Z]:\//u.test(p)) {
    p = p.replace(/^[a-zA-Z]:/u, "").replace(/^\/+/u, "");
  }
  return p
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "." && s !== "..")
    .join("/");
}

export function joinRelativePath(parent: string, child: string): string {
  const a = normalizeRelativePath(parent);
  const b = normalizeRelativePath(child);
  if (!a) return b;
  if (!b) return a;
  return `${a}/${b}`;
}

export function isHiddenKeep(file: ProjectFileRecord): boolean {
  return (
    file.filename === ".keep" ||
    (file.mime ?? "").trim() === DIRECTORY_MIME
  );
}

export function fileFullPath(file: ProjectFileRecord): string {
  const parent = normalizeRelativePath(file.relativePath);
  return parent ? `${parent}/${file.filename}` : file.filename;
}

/** 某文件夹路径下的所有文档（含子目录），含 .keep */
export function filesUnderFolder(
  files: ProjectFileRecord[],
  folderPath: string,
): ProjectFileRecord[] {
  const prefix = normalizeRelativePath(folderPath);
  if (!prefix) return files;
  return files.filter((f) => {
    const parent = normalizeRelativePath(f.relativePath);
    if (parent === prefix) return true;
    return parent.startsWith(`${prefix}/`);
  });
}

/**
 * 从 package 文件列表构建树。
 * .keep / directory mime 不显示为文件，只贡献文件夹节点。
 */
export function buildPackageFileTree(
  files: ProjectFileRecord[],
): FileTreeFolderNode {
  const root: FileTreeFolderNode = {
    kind: "folder",
    path: "",
    name: "",
    children: [],
    markerIds: [],
  };

  const folderMap = new Map<string, FileTreeFolderNode>();
  folderMap.set("", root);

  const ensureFolder = (path: string): FileTreeFolderNode => {
    const norm = normalizeRelativePath(path);
    const existing = folderMap.get(norm);
    if (existing) return existing;

    const parts = norm.split("/").filter(Boolean);
    let current = root;
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let next = folderMap.get(acc);
      if (!next) {
        next = {
          kind: "folder",
          path: acc,
          name: part,
          children: [],
          markerIds: [],
        };
        folderMap.set(acc, next);
        current.children.push(next);
      }
      current = next;
    }
    return current;
  };

  for (const file of files) {
    const parent = normalizeRelativePath(file.relativePath);
    const folder = ensureFolder(parent);
    if (isHiddenKeep(file)) {
      folder.markerIds.push(file.id);
      continue;
    }
    folder.children.push({
      kind: "file",
      id: file.id,
      name: file.filename,
      relativePath: parent,
      file,
    });
  }

  const sortNode = (node: FileTreeFolderNode) => {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "zh");
    });
    for (const child of node.children) {
      if (child.kind === "folder") sortNode(child);
    }
  };
  sortNode(root);
  return root;
}
