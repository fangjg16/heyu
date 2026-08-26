import type { ProjectFileRecord } from "@/lib/project-api";
import { resolveFileTopic } from "@/lib/file-topic";
import {
  PROJECT_UPLOAD_FOLDER,
  SESSION_UPLOAD_FOLDER,
  AI_GENERATED_FOLDER,
} from "@/lib/project-api";
import {
  buildPackageFileTree,
  isHiddenKeep,
  joinRelativePath,
  normalizeRelativePath,
  type FileTreeFolderNode,
  type FileTreeNode,
} from "@/lib/project-file-tree";

export type FileSourceBucket = "project" | "session" | "issuer" | "ai";

export const PROJECT_SOURCE_PATH = "__source_project__";
export const SESSION_SOURCE_PATH = "__session__";
export const ISSUER_SOURCE_PATH = "__source_issuer__";
export const AI_SOURCE_PATH = "__source_ai__";
export const TOPIC_ROOT_PATH = "__topic__";

export const SOURCE_BUCKETS: {
  id: FileSourceBucket;
  path: string;
  name: string;
}[] = [
  { id: "project", path: PROJECT_SOURCE_PATH, name: "项目上传" },
  { id: "session", path: SESSION_SOURCE_PATH, name: "对话上传" },
  { id: "issuer", path: ISSUER_SOURCE_PATH, name: "协作方上传" },
  { id: "ai", path: AI_SOURCE_PATH, name: "AI生成" },
];

const ISSUER_PREFIXES = ["项目协作方上传", "项目方上传"];
/** 长前缀在前：避免把「项目上传的/…」误剥成「的/…」 */
const PROJECT_PREFIXES = [PROJECT_UPLOAD_FOLDER, "项目上传"].filter(
  (p, i, all) => all.findIndex((x) => x === p) === i,
);

export function fileSourceBucket(file: ProjectFileRecord): FileSourceBucket {
  if (file.scope === "session") return "session";
  if (file.sourceKind === "issuer_upload") return "issuer";
  if (file.sourceKind === "ai_generated") return "ai";
  const path = normalizeRelativePath(file.relativePath);
  for (const prefix of ISSUER_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return "issuer";
  }
  if (path === AI_GENERATED_FOLDER || path.startsWith(`${AI_GENERATED_FOLDER}/`)) return "ai";
  return "project";
}

function stripPrefix(path: string, prefix: string): string {
  const p = normalizeRelativePath(path);
  if (p === prefix) return "";
  if (p.startsWith(`${prefix}/`)) return p.slice(prefix.length + 1);
  return p;
}

function stripFirstMatching(path: string, prefixes: string[]): string {
  const p = normalizeRelativePath(path);
  const matched = prefixes
    .filter((prefix) => p === prefix || p.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return matched ? stripPrefix(p, matched) : p;
}

export function stripSourcePrefix(
  path: string | null | undefined,
  bucket: FileSourceBucket,
): string {
  const p = normalizeRelativePath(path);
  if (bucket === "project") return stripFirstMatching(p, PROJECT_PREFIXES);
  if (bucket === "session") return stripPrefix(p, SESSION_UPLOAD_FOLDER);
  if (bucket === "ai") return stripPrefix(p, AI_GENERATED_FOLDER);
  return stripFirstMatching(p, ISSUER_PREFIXES);
}

export function isSourceRootPath(path: string): boolean {
  const p = normalizeRelativePath(path);
  return (
    p === PROJECT_SOURCE_PATH ||
    p === SESSION_SOURCE_PATH ||
    p === ISSUER_SOURCE_PATH ||
    p === AI_SOURCE_PATH
  );
}

export function isTopicPath(path: string): boolean {
  const p = normalizeRelativePath(path);
  return p === TOPIC_ROOT_PATH || p.startsWith(`${TOPIC_ROOT_PATH}/`);
}

export function sourceBucketFromVirtualPath(
  path: string,
): FileSourceBucket | null {
  const p = normalizeRelativePath(path);
  if (p === PROJECT_SOURCE_PATH || p.startsWith(`${PROJECT_SOURCE_PATH}/`)) {
    return "project";
  }
  if (p === SESSION_SOURCE_PATH || p.startsWith(`${SESSION_SOURCE_PATH}/`)) {
    return "session";
  }
  if (p === ISSUER_SOURCE_PATH || p.startsWith(`${ISSUER_SOURCE_PATH}/`)) {
    return "issuer";
  }
  if (p === AI_SOURCE_PATH || p.startsWith(`${AI_SOURCE_PATH}/`)) {
    return "ai";
  }
  return null;
}

/** 资料包 relative_path → 虚拟树路径 */
export function toVirtualFolder(
  physical: string,
  bucket: FileSourceBucket,
): string {
  const rest = stripSourcePrefix(physical, bucket);
  const root =
    bucket === "project"
      ? PROJECT_SOURCE_PATH
      : bucket === "session"
        ? SESSION_SOURCE_PATH
        : bucket === "ai"
          ? AI_SOURCE_PATH
          : ISSUER_SOURCE_PATH;
  return joinRelativePath(root, rest);
}

/** 虚拟树路径 → 资料包 relative_path */
export function toPhysicalFolder(virtualPath: string): string {
  const p = normalizeRelativePath(virtualPath);
  if (!p || p === PROJECT_SOURCE_PATH) return PROJECT_UPLOAD_FOLDER;
  if (p.startsWith(`${PROJECT_SOURCE_PATH}/`)) {
    return joinRelativePath(
      PROJECT_UPLOAD_FOLDER,
      p.slice(PROJECT_SOURCE_PATH.length + 1),
    );
  }
  if (p === SESSION_SOURCE_PATH) return SESSION_UPLOAD_FOLDER;
  if (p.startsWith(`${SESSION_SOURCE_PATH}/`)) {
    return joinRelativePath(
      SESSION_UPLOAD_FOLDER,
      p.slice(SESSION_SOURCE_PATH.length + 1),
    );
  }
  if (p === ISSUER_SOURCE_PATH) return "项目协作方上传";
  if (p.startsWith(`${ISSUER_SOURCE_PATH}/`)) {
    return joinRelativePath(
      "项目协作方上传",
      p.slice(ISSUER_SOURCE_PATH.length + 1),
    );
  }
  if (p === AI_SOURCE_PATH) return AI_GENERATED_FOLDER;
  if (p.startsWith(`${AI_SOURCE_PATH}/`)) {
    return joinRelativePath(AI_GENERATED_FOLDER, p.slice(AI_SOURCE_PATH.length + 1));
  }
  return p;
}

export function canShareWithIssuer(file: ProjectFileRecord): boolean {
  return fileSourceBucket(file) === "project" && file.scope === "package";
}

export function topicLabelForFile(
  file: ProjectFileRecord,
  parsedType?: string,
): string {
  return resolveFileTopic({
    filename: file.filename,
    relativePath: file.relativePath,
    fileCategory: file.fileCategory,
    documentType: parsedType,
  }).label;
}

function folderAt(root: FileTreeFolderNode, path: string): FileTreeFolderNode | null {
  for (const c of root.children) {
    if (c.kind === "folder" && c.path === path) return c;
  }
  return null;
}

/** 左侧按上传来源：项目上传 / 对话上传 / 协作方上传 / AI生成 */
export function buildSourceMaterialsTree(
  files: ProjectFileRecord[],
): FileTreeFolderNode {
  const children: FileTreeNode[] = SOURCE_BUCKETS.map((b) => {
    const rewritten = files
      .filter((f) => fileSourceBucket(f) === b.id)
      .map((f) => ({
        ...f,
        relativePath: joinRelativePath(
          b.path,
          stripSourcePrefix(f.relativePath, b.id),
        ),
      }));
    const inner = buildPackageFileTree(rewritten);
    const folder = folderAt(inner, b.path);
    return {
      kind: "folder" as const,
      path: b.path,
      name: b.name,
      children: folder?.children ?? [],
      markerIds: folder?.markerIds ?? [],
    };
  });
  return { kind: "folder", path: "", name: "源文件", children, markerIds: [] };
}

/** 左侧按主题：收成少数投研桶（对标、财务、定位…），不用解析器给每份文件起的长类型名 */
export function buildTopicMaterialsTree(
  files: ProjectFileRecord[],
  parsedTypeById: Record<string, string | undefined>,
): FileTreeFolderNode {
  const map = new Map<string, ProjectFileRecord[]>();
  for (const file of files) {
    if (isHiddenKeep(file)) continue;
    const label = topicLabelForFile(file, parsedTypeById[file.id]);
    const list = map.get(label) ?? [];
    list.push(file);
    map.set(label, list);
  }
  const children: FileTreeNode[] = Array.from(map.entries())
    .sort((a, b) => {
      if (a[0] === "其他") return 1;
      if (b[0] === "其他") return -1;
      return a[0].localeCompare(b[0], "zh");
    })
    .map(([label, list]) => ({
      kind: "folder" as const,
      path: `${TOPIC_ROOT_PATH}/${encodeURIComponent(label)}`,
      name: `${label}（${list.length}）`,
      children: list
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((file) => ({
          kind: "file" as const,
          id: file.id,
          name: file.filename,
          relativePath: `${TOPIC_ROOT_PATH}/${encodeURIComponent(label)}`,
          file,
        })),
      markerIds: [] as string[],
    }));
  return { kind: "folder", path: "", name: "源文件", children, markerIds: [] };
}
