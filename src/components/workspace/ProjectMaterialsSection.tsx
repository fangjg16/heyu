import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Eye,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";
import { ChatMarkdown } from "@/components/workspace/ChatMarkdown";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-auth";
import {
  AI_CHAT_ENDPOINT,
  createProjectPackageFolder,
  deleteProjectFile,
  ENABLE_LIVE_CHAT,
  fetchProjectFileParseSummary,
  fetchProjectFiles,
  moveProjectFile,
  PROJECT_UPLOAD_FOLDER,
  shareFileWithIssuer,
  uploadProjectPackageFile,
  type ProjectFileRecord,
} from "@/lib/project-api";
import {
  filesUnderFolder,
  isHiddenKeep,
  joinRelativePath,
  normalizeRelativePath,
  type FileTreeFileNode,
  type FileTreeFolderNode,
  type FileTreeNode,
} from "@/lib/project-file-tree";
import {
  buildSourceMaterialsTree,
  buildTopicMaterialsTree,
  canShareWithIssuer,
  fileSourceBucket,
  ISSUER_SOURCE_PATH,
  isSourceRootPath,
  isTopicPath,
  PROJECT_SOURCE_PATH,
  SESSION_SOURCE_PATH,
  sourceBucketFromVirtualPath,
  SOURCE_BUCKETS,
  toPhysicalFolder,
  toVirtualFolder,
} from "@/lib/project-file-source";
import { resolveFileTopic } from "@/lib/file-topic";
import {
  relativePathFromWebkitFile,
  unzipProjectPackageFiles,
} from "@/lib/unzip-project-files";

const DND_DOC_MIME = "application/x-taizi-document";

type ProjectMaterialsSectionProps = {
  projectId: string;
  userId: string;
  canManage?: boolean;
  canDownload?: boolean;
};

type FileKindFilter = "all" | "pdf" | "text" | "other";
type ParseFilter = "all" | "parsed" | "unparsed";
type Selection =
  | { kind: "folder"; path: string }
  | { kind: "file"; id: string };

type FileTag = {
  label: string;
  bg: string;
  fg: string;
};

type ParseCacheEntry = {
  summary: string;
  chunkCount: number;
  status: "parsed" | "failed" | "parsing";
  documentType?: string;
  keyPoints?: string[];
  refs?: string[];
  usedFor?: string[];
};

type ParseUiStatus = "unparsed" | "parsing" | "parsed" | "failed";

function formatFileDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatFileSize(bytes: number | undefined | null): string {
  const n = Number(bytes) || 0;
  if (n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 旧版 100 字硬截或残缺 JSON：再点一次应重新向接口拉摘要 */
function shouldRefetchParseSummary(summary: string): boolean {
  const t = summary.trim();
  if (!t || t === "—") return true;
  if (t.startsWith("{") && /"summary"\s*:/u.test(t)) return true;
  if (/[.。！？!?…]$/u.test(t)) return false;
  const n = Array.from(t).length;
  return n === 100 || n === 200;
}

function hasWebkitPath(file: File): boolean {
  return Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath);
}

function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isMarkdownFile(file: ProjectFileRecord): boolean {
  const ext = fileExt(file.filename);
  const mime = (file.mime ?? "").toLowerCase();
  return ext === "md" || ext === "markdown" || mime.includes("markdown");
}

function classifyFileKind(file: ProjectFileRecord): FileKindFilter {
  const ext = fileExt(file.filename);
  const mime = (file.mime ?? "").toLowerCase();
  if (ext === "pdf" || mime.includes("pdf")) return "pdf";
  if (
    ["txt", "md", "markdown", "html", "htm", "csv", "json", "log"].includes(ext) ||
    mime.startsWith("text/") ||
    mime.includes("markdown")
  ) {
    return "text";
  }
  return "other";
}

function previewFormat(file: ProjectFileRecord): string {
  const ext = fileExt(file.filename);
  if (ext) return ext.toUpperCase();
  if ((file.mime ?? "").includes("pdf")) return "PDF";
  return "FILE";
}

function parseUiStatus(
  fileId: string,
  parsedById: Record<string, ParseCacheEntry>,
  parsingId: string | null,
  dbParsed = false,
): ParseUiStatus {
  if (parsingId === fileId) return "parsing";
  const cached = parsedById[fileId];
  if (cached?.status === "parsing") return "parsing";
  if (cached?.status === "parsed") return "parsed";
  if (cached?.status === "failed") return "failed";
  if (dbParsed) return "parsed";
  return "unparsed";
}

function tagsForFile(
  file: ProjectFileRecord,
  canDownload: boolean,
  uiStatus: ParseUiStatus,
): FileTag[] {
  const tags: FileTag[] = [];
  if (file.scope === "package" && !canDownload) {
    tags.push({ label: "受限", bg: "#EFE7E6", fg: "#A06358" });
    return tags;
  }
  if (uiStatus === "parsing") {
    tags.push({
      label: "解析中",
      bg: "rgba(213,154,47,0.15)",
      fg: "#B07d1f",
    });
  } else if (uiStatus === "parsed") {
    tags.push({
      label: "已解析",
      bg: "rgba(94,155,117,0.15)",
      fg: "#3F6F63",
    });
  } else {
    tags.push({
      label: "未解析",
      bg: "rgba(78,66,57,0.08)",
      fg: "#59625F",
    });
  }
  if (file.scope === "session") {
    tags.push({
      label: "对话上传",
      bg: "rgba(160,99,88,0.1)",
      fg: "#A06358",
    });
  }
  if (fileSourceBucket(file) === "issuer") {
    tags.push({
      label: "协作方上传",
      bg: "rgba(78,66,57,0.08)",
      fg: "#59625F",
    });
  }
  if (fileSourceBucket(file) === "ai") {
    tags.push({
      label: "AI生成",
      bg: "rgba(160,99,88,0.1)",
      fg: "#A06358",
    });
  }
  if (file.sharedWithIssuer && file.scope === "package") {
    tags.push({
      label: "已共享",
      bg: "rgba(94,155,117,0.15)",
      fg: "#3F6F63",
    });
  }
  return tags;
}

function matchesFilters(
  file: ProjectFileRecord,
  query: string,
  kind: FileKindFilter,
  parse: ParseFilter,
  uiStatus: ParseUiStatus,
): boolean {
  if (isHiddenKeep(file)) return false;
  const q = query.trim().toLowerCase();
  if (q) {
    const hay = `${file.filename} ${file.relativePath ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (kind !== "all" && classifyFileKind(file) !== kind) return false;
  if (parse === "parsed" && uiStatus !== "parsed") return false;
  if (parse === "unparsed" && uiStatus === "parsed") return false;
  return true;
}

function filterTree(
  node: FileTreeFolderNode,
  query: string,
  kind: FileKindFilter,
  parse: ParseFilter,
  parsedById: Record<string, ParseCacheEntry>,
  parsingId: string | null,
): FileTreeFolderNode {
  const children: FileTreeNode[] = [];
  for (const child of node.children) {
    if (child.kind === "file") {
      const ui = parseUiStatus(
        child.id,
        parsedById,
        parsingId,
        Boolean(child.file.parsed),
      );
      if (matchesFilters(child.file, query, kind, parse, ui)) children.push(child);
      continue;
    }
    const next = filterTree(child, query, kind, parse, parsedById, parsingId);
    const keepEmptySource =
      isSourceRootPath(child.path) &&
      !query.trim() &&
      kind === "all" &&
      parse === "all";
    if (next.children.length > 0 || keepEmptySource || next.markerIds.length > 0) {
      children.push(next);
    }
  }
  return { ...node, children };
}

function findFolder(
  root: FileTreeFolderNode,
  path: string,
): FileTreeFolderNode | null {
  const norm = normalizeRelativePath(path);
  if (!norm) return root;
  const walk = (node: FileTreeFolderNode): FileTreeFolderNode | null => {
    if (node.path === norm) return node;
    for (const c of node.children) {
      if (c.kind === "folder") {
        const hit = walk(c);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(root);
}

function findFile(
  root: FileTreeFolderNode,
  id: string,
): Extract<FileTreeNode, { kind: "file" }> | null {
  for (const c of root.children) {
    if (c.kind === "file" && c.id === id) return c;
    if (c.kind === "folder") {
      const hit = findFile(c, id);
      if (hit) return hit;
    }
  }
  return null;
}

function folderPathTrail(
  root: FileTreeFolderNode,
  path: string,
): { label: string; path: string }[] {
  const norm = normalizeRelativePath(path);
  if (!norm) return [];
  if (isTopicPath(norm)) {
    const folder = findFolder(root, norm);
    return [{ label: folder?.name ?? "主题", path: norm }];
  }
  const bucket = SOURCE_BUCKETS.find(
    (b) => norm === b.path || norm.startsWith(`${b.path}/`),
  );
  if (bucket) {
    const rest = norm === bucket.path ? [] : norm.slice(bucket.path.length + 1).split("/").filter(Boolean);
    const trail: { label: string; path: string }[] = [
      { label: bucket.name, path: bucket.path },
    ];
    let acc = bucket.path;
    for (const part of rest) {
      acc = `${acc}/${part}`;
      const folder = findFolder(root, acc);
      trail.push({ label: folder?.name ?? part, path: acc });
    }
    return trail;
  }
  const parts = norm.split("/").filter(Boolean);
  const trail: { label: string; path: string }[] = [];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    const folder = findFolder(root, acc);
    trail.push({ label: folder?.name ?? part, path: acc });
  }
  return trail;
}

function resolveUploadFolder(targetFolder: string): string {
  if (isTopicPath(targetFolder) || !targetFolder) return PROJECT_UPLOAD_FOLDER;
  const bucket = sourceBucketFromVirtualPath(targetFolder);
  if (bucket === "session" || bucket === "issuer" || bucket === "ai") return PROJECT_UPLOAD_FOLDER;
  return toPhysicalFolder(targetFolder);
}

async function downloadFileBlob(
  projectId: string,
  fileId: string,
  userId: string,
  fallbackName?: string,
): Promise<{ blob: Blob; filename: string }> {
  const q = new URLSearchParams({ userId });
  const res = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/download?${q}`,
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `下载失败（${res.status}）`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  // 优先 RFC5987 filename*=UTF-8''...
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(cd);
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^";]+)/i.exec(cd);
  let filename = fallbackName?.trim() || "download";
  try {
    if (star?.[1]) {
      filename = decodeURIComponent(star[1].trim());
    } else if (plain?.[1] || plain?.[2]) {
      const raw = (plain[1] ?? plain[2] ?? "").trim();
      filename = decodeURIComponent(raw);
    }
  } catch {
    /* 保留 fallback */
  }
  if (!filename.trim()) filename = fallbackName?.trim() || "download";
  return { blob, filename };
}

export function ProjectMaterialsSection({
  projectId,
  userId,
  canManage = true,
  canDownload = false,
}: ProjectMaterialsSectionProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<string>("");

  const [liveFiles, setLiveFiles] = useState<ProjectFileRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "": true,
    [PROJECT_SOURCE_PATH]: true,
    [SESSION_SOURCE_PATH]: true,
    [ISSUER_SOURCE_PATH]: true,
  });
  const [selection, setSelection] = useState<Selection>({
    kind: "folder",
    path: PROJECT_SOURCE_PATH,
  });
  const [facet, setFacet] = useState<"source" | "topic">("source");
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<FileKindFilter>("all");
  const [parseFilter, setParseFilter] = useState<ParseFilter>("all");
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [parsedById, setParsedById] = useState<Record<string, ParseCacheEntry>>(
    {},
  );
  const [parsingId, setParsingId] = useState<string | null>(null);

  const useLive = ENABLE_LIVE_CHAT && Boolean(AI_CHAT_ENDPOINT);

  const reload = useCallback(async () => {
    if (!useLive || !userId) {
      setLiveFiles(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const files = await fetchProjectFiles(projectId, userId);
      setLiveFiles(files);
    } catch (e) {
      setLiveFiles([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, userId, useLive]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
  }, []);

  const allLive = liveFiles ?? [];
  const packageLive = useMemo(
    () => allLive.filter((f) => f.scope === "package"),
    [allLive],
  );

  const fullTree = useMemo(() => {
    if (facet === "topic") {
      const parsedTypeById: Record<string, string | undefined> = {};
      for (const [id, entry] of Object.entries(parsedById)) {
        parsedTypeById[id] = entry.documentType;
      }
      return buildTopicMaterialsTree(allLive, parsedTypeById);
    }
    return buildSourceMaterialsTree(allLive);
  }, [allLive, facet, parsedById]);

  const tree = useMemo(
    () =>
      filterTree(
        fullTree,
        query,
        kindFilter,
        parseFilter,
        parsedById,
        parsingId,
      ),
    [fullTree, query, kindFilter, parseFilter, parsedById, parsingId],
  );

  const selectedFolder = useMemo(() => {
    if (selection.kind !== "folder") return null;
    return findFolder(fullTree, selection.path);
  }, [fullTree, selection]);

  const selectedFileNode = useMemo(() => {
    if (selection.kind !== "file") return null;
    return findFile(fullTree, selection.id);
  }, [fullTree, selection]);

  useEffect(() => {
    if (selection.kind === "file" && !findFile(fullTree, selection.id)) {
      setSelection({
        kind: "folder",
        path: facet === "source" ? PROJECT_SOURCE_PATH : "",
      });
    }
    if (selection.kind === "folder" && selection.path && !findFolder(fullTree, selection.path)) {
      const fallback =
        facet === "topic"
          ? fullTree.children[0]?.kind === "folder"
            ? fullTree.children[0].path
            : ""
          : PROJECT_SOURCE_PATH;
      setSelection({ kind: "folder", path: fallback });
    }
  }, [facet, fullTree, selection]);

  useEffect(() => {
    if (facet === "source") {
      setSelection({ kind: "folder", path: PROJECT_SOURCE_PATH });
      setExpanded((prev) => ({
        ...prev,
        [PROJECT_SOURCE_PATH]: true,
        [SESSION_SOURCE_PATH]: true,
        [ISSUER_SOURCE_PATH]: true,
      }));
      return;
    }
    const first = fullTree.children.find((c) => c.kind === "folder");
    setSelection({
      kind: "folder",
      path: first && first.kind === "folder" ? first.path : "",
    });
    setExpanded((prev) => {
      const next = { ...prev };
      for (const c of fullTree.children) {
        if (c.kind === "folder") next[c.path] = true;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随分类方式切换
  }, [facet]);

  const uploadMany = useCallback(
    async (items: { file: File; relativePath: string }[]): Promise<void> => {
      if (!items.length || !useLive || !canManage) return;
      setUploading(true);
      setError(null);
      setUploadHint(null);
      const errors: string[] = [];
      const parseQueue: string[] = [];
      let ok = 0;
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          setUploadHint(`上传中 ${i + 1}/${items.length}：${item.file.name}`);
          try {
            const uploaded = await uploadProjectPackageFile(
              projectId,
              userId,
              item.file,
              { relativePath: item.relativePath },
            );
            ok += 1;
            if (
              uploaded.documentId &&
              (uploaded.parseQueued || uploaded.parsed) &&
              item.file.name !== ".keep"
            ) {
              parseQueue.push(uploaded.documentId);
            }
          } catch (e) {
            errors.push(
              `${item.file.name}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        await reload();
        if (ok > 0) {
          const folders = new Set(
            items.map((it) =>
              toVirtualFolder(normalizeRelativePath(it.relativePath), "project"),
            ),
          );
          if (folders.size > 0) {
            setExpanded((prev) => {
              const next = { ...prev };
              for (const f of folders) next[f] = true;
              next[PROJECT_SOURCE_PATH] = true;
              return next;
            });
          }
        }
        if (errors.length > 0) {
          setError(
            `已上传 ${ok}/${items.length}。失败：${errors.slice(0, 3).join("；")}${
              errors.length > 3 ? "…" : ""
            }`,
          );
        } else {
          setUploadHint(
            parseQueue.length > 0
              ? `已上传 ${ok} 个文件，正在自动解析 ${parseQueue.length} 个…`
              : `已上传 ${ok} 个文件`,
          );
        }
        if (parseQueue.length > 0) {
          setParsedById((prev) => {
            const next = { ...prev };
            for (const id of parseQueue) {
              if (next[id]?.status === "parsed") continue;
              next[id] = {
                summary: "上传后自动解析中…",
                chunkCount: 0,
                status: "parsing",
                keyPoints: [],
                refs: [],
                usedFor: [],
              };
            }
            return next;
          });
          void (async () => {
            for (const docId of parseQueue) {
              try {
                const result = await fetchProjectFileParseSummary(
                  projectId,
                  docId,
                  userId,
                );
                setParsedById((prev) => ({
                  ...prev,
                  [docId]: {
                    summary: result.summary,
                    chunkCount: result.chunkCount,
                    status: result.parsed ? "parsed" : "failed",
                    documentType: result.documentType,
                    keyPoints: result.keyPoints ?? [],
                    refs: result.refs ?? [],
                    usedFor: result.usedFor ?? [],
                  },
                }));
                if (result.parsed) {
                  setLiveFiles((prev) =>
                    (prev ?? []).map((f) =>
                      f.id === docId ? { ...f, parsed: true } : f,
                    ),
                  );
                }
              } catch (e) {
                setParsedById((prev) => ({
                  ...prev,
                  [docId]: {
                    summary: e instanceof Error ? e.message : String(e),
                    chunkCount: 0,
                    status: "failed",
                    keyPoints: [],
                    refs: [],
                    usedFor: [],
                  },
                }));
              }
            }
            setUploadHint((hint) =>
              hint?.includes("自动解析")
                ? `已上传 ${ok} 个文件，自动解析完成`
                : hint,
            );
          })();
        }
      } finally {
        setUploading(false);
      }
    },
    [canManage, projectId, reload, useLive, userId],
  );

  const processUploadSelection = useCallback(
    async (list: FileList | File[] | null, targetFolder: string): Promise<void> => {
      if (!list?.length) return;
      if (sourceBucketFromVirtualPath(targetFolder) === "issuer") {
        setError("协作方上传的文件由项目协作方在协作工作台提交");
        return;
      }
      if (sourceBucketFromVirtualPath(targetFolder) === "ai") {
        setError("AI生成目录由对话产出写入，请上传到「项目上传」");
        return;
      }
      const files = Array.from(list);
      const base = resolveUploadFolder(targetFolder);

      if (files.length === 1 && isZipFile(files[0]!) && !hasWebkitPath(files[0]!)) {
        setUploading(true);
        setError(null);
        setUploadHint("正在解压 ZIP…");
        try {
          const items = await unzipProjectPackageFiles(files[0]!, base);
          setUploadHint(`解压完成，共 ${items.length} 个文件，开始上传…`);
          await uploadMany(items);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setUploadHint(null);
        } finally {
          setUploading(false);
        }
        return;
      }

      if (files.some(hasWebkitPath)) {
        await uploadMany(
          files.map((file) => ({
            file,
            relativePath: relativePathFromWebkitFile(file, base),
          })),
        );
        return;
      }

      await uploadMany(
        files.map((file) => ({
          file,
          relativePath: base,
        })),
      );
    },
    [uploadMany],
  );

  const onFolderInputChange = useCallback(
    async (list: FileList | null, targetFolder: string) => {
      if (!list?.length) return;
      const base = resolveUploadFolder(targetFolder);
      await uploadMany(
        Array.from(list).map((file) => ({
          file,
          relativePath: relativePathFromWebkitFile(file, base),
        })),
      );
      if (folderInputRef.current) folderInputRef.current.value = "";
    },
    [uploadMany],
  );

  const triggerFilePicker = (targetFolder: string) => {
    uploadTargetRef.current = targetFolder;
    fileInputRef.current?.click();
  };

  const triggerFolderPicker = (targetFolder: string) => {
    uploadTargetRef.current = targetFolder;
    folderInputRef.current?.click();
  };

  const onCreateFolder = async (parentPath: string) => {
    if (!useLive || !canManage || uploading) return;
    if (isTopicPath(parentPath)) return;
    const bucket = sourceBucketFromVirtualPath(parentPath || PROJECT_SOURCE_PATH);
    if (bucket === "session" || bucket === "issuer" || bucket === "ai") return;
    const name = window.prompt("新建文件夹名称", "新建文件夹")?.trim();
    if (!name) return;
    if (/[/\\]/.test(name) || name === "." || name === "..") {
      setError("文件夹名称不能包含 / 或 \\");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const virtualParent = parentPath || PROJECT_SOURCE_PATH;
      const physicalFull = joinRelativePath(toPhysicalFolder(virtualParent), name);
      const virtualFull = joinRelativePath(virtualParent, name);
      await createProjectPackageFolder(projectId, userId, physicalFull);
      setExpanded((prev) => ({
        ...prev,
        [virtualFull]: true,
        [virtualParent]: true,
      }));
      setSelection({ kind: "folder", path: virtualFull });
      setUploadHint(`已创建文件夹「${name}」`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const onDeleteFile = async (file: ProjectFileRecord) => {
    if (!useLive || !canManage) return;
    if (fileSourceBucket(file) === "issuer") return;
    if (file.scope !== "package" && file.scope !== "session") return;
    const ok = window.confirm(
      `确定删除「${file.filename}」？\n删除后列表与检索将不再显示该文件；文件数据会保留。`,
    );
    if (!ok) return;
    setDeletingId(file.id);
    setError(null);
    try {
      await deleteProjectFile(projectId, file.id, userId);
      if (selection.kind === "file" && selection.id === file.id) {
        setSelection({ kind: "folder", path: PROJECT_SOURCE_PATH });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const onShareFile = async (file: ProjectFileRecord, shared: boolean) => {
    if (!canManage || !canShareWithIssuer(file)) return;
    if (Boolean(file.sharedWithIssuer) === shared) return;
    setSharingId(file.id);
    setError(null);
    try {
      await shareFileWithIssuer(projectId, file.id, shared, "investor_share");
      setLiveFiles((prev) =>
        (prev ?? []).map((f) =>
          f.id === file.id
            ? {
                ...f,
                sharedWithIssuer: shared,
                sourceKind: shared ? "investor_share" : null,
              }
            : f,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "授权失败");
    } finally {
      setSharingId(null);
    }
  };

  const onMoveFile = useCallback(
    async (file: ProjectFileRecord, targetFolder: string) => {
      if (!useLive || !canManage) return;
      if (fileSourceBucket(file) !== "project" || file.scope !== "package") {
        setError("仅项目上传的文件可在资料夹之间移动");
        return;
      }
      if (
        isTopicPath(targetFolder) ||
        sourceBucketFromVirtualPath(targetFolder) === "session" ||
        sourceBucketFromVirtualPath(targetFolder) === "issuer" ||
        sourceBucketFromVirtualPath(targetFolder) === "ai"
      ) {
        return;
      }
      const target = toPhysicalFolder(targetFolder);
      if (normalizeRelativePath(file.relativePath) === target) return;
      setDeletingId(file.id);
      setError(null);
      setUploadHint(`正在移动「${file.filename}」…`);
      try {
        await moveProjectFile(projectId, file.id, userId, target);
        const virtualTarget = normalizeRelativePath(targetFolder);
        setExpanded((prev) =>
          virtualTarget ? { ...prev, [virtualTarget]: true } : prev,
        );
        const label =
          virtualTarget === PROJECT_SOURCE_PATH
            ? "项目上传"
            : virtualTarget.split("/").pop() || "项目上传";
        setUploadHint(`已移动到「${label}」`);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setUploadHint(null);
      } finally {
        setDeletingId(null);
      }
    },
    [canManage, projectId, reload, useLive, userId],
  );

  const acceptTreeDrop = useCallback(
    (dataTransfer: DataTransfer, targetFolder: string) => {
      if (!canManage || !useLive) return;
      if (
        sourceBucketFromVirtualPath(targetFolder) === "session" ||
        sourceBucketFromVirtualPath(targetFolder) === "issuer" ||
        isTopicPath(targetFolder)
      ) {
        return;
      }
      const raw = dataTransfer.getData(DND_DOC_MIME);
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { id?: string };
          const file = liveFiles?.find((f) => f.id === payload.id);
          if (file) void onMoveFile(file, targetFolder);
        } catch {
          /* ignore */
        }
        return;
      }
      if (dataTransfer.files?.length) {
        void processUploadSelection(dataTransfer.files, targetFolder);
      }
    },
    [canManage, liveFiles, onMoveFile, processUploadSelection, useLive],
  );

  const onDeleteFolder = async (folderPath: string) => {
    if (
      !useLive ||
      !canManage ||
      !folderPath ||
      isSourceRootPath(folderPath) ||
      isTopicPath(folderPath) ||
      sourceBucketFromVirtualPath(folderPath) !== "project"
    ) {
      return;
    }
    const physical = toPhysicalFolder(folderPath);
    const under = filesUnderFolder(packageLive, physical);
    if (under.length === 0) return;
    const folderName =
      findFolder(fullTree, folderPath)?.name ||
      folderPath.split("/").pop() ||
      folderPath;
    const ok = window.confirm(
      `确定删除文件夹「${folderName}」及其下 ${under.length} 个条目？\n列表将隐藏这些条目；文件数据会保留。`,
    );
    if (!ok) return;
    setDeletingId(`folder:${folderPath}`);
    setError(null);
    const errors: string[] = [];
    try {
      for (const f of under) {
        try {
          await deleteProjectFile(projectId, f.id, userId);
        } catch (e) {
          errors.push(
            `${f.filename}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (selection.kind === "folder" && selection.path === folderPath) {
        setSelection({ kind: "folder", path: "" });
      }
      await reload();
      if (errors.length > 0) {
        setError(`部分删除失败：${errors.slice(0, 3).join("；")}`);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const busy = uploading || Boolean(deletingId);

  const canParseFile = useCallback(
    (file: ProjectFileRecord) => {
      if (!useLive || !userId) return false;
      if (file.scope === "package" && !canDownload) return false;
      return true;
    },
    [useLive, userId, canDownload],
  );

  const runParse = useCallback(
    async (file: ProjectFileRecord) => {
      if (!canParseFile(file)) {
        setError("当前权限无法解析该文件（受限）");
        return;
      }
      if (parsedById[file.id]?.status === "parsed") {
        if (!shouldRefetchParseSummary(parsedById[file.id]?.summary ?? "")) {
          return;
        }
      }
      if (parsedById[file.id]?.status === "parsing") return;
      if (parsingId === file.id) return;
      setParsingId(file.id);
      setError(null);
      try {
        const result = await fetchProjectFileParseSummary(
          projectId,
          file.id,
          userId,
        );
        setParsedById((prev) => ({
          ...prev,
          [file.id]: {
            summary: result.summary,
            chunkCount: result.chunkCount,
            status: result.parsed ? "parsed" : "failed",
            documentType: result.documentType,
            keyPoints: result.keyPoints ?? [],
            refs: result.refs ?? [],
            usedFor: result.usedFor ?? [],
          },
        }));
        if (result.parsed) {
          setLiveFiles((prev) =>
            (prev ?? []).map((f) =>
              f.id === file.id
                ? {
                    ...f,
                    parsed: true,
                    fileCategory:
                      String(f.fileCategory ?? "").trim() ||
                      result.documentType ||
                      f.fileCategory,
                  }
                : f,
            ),
          );
        }
        if (!result.parsed) {
          setError(result.summary || "暂未解析正文");
        }
      } catch (e) {
        setParsedById((prev) => ({
          ...prev,
          [file.id]: {
            summary: e instanceof Error ? e.message : String(e),
            chunkCount: 0,
            status: "failed",
            keyPoints: [],
            refs: [],
            usedFor: [],
          },
        }));
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setParsingId((cur) => (cur === file.id ? null : cur));
      }
    },
    [canParseFile, parsedById, parsingId, projectId, userId],
  );

  const selectFile = useCallback(
    (file: ProjectFileRecord) => {
      setSelection({ kind: "file", id: file.id });
      if (!canParseFile(file)) return;
      const cached = parsedById[file.id];
      // 已有完整落库缓存则不重复请求；半截 100 字摘要除外
      if (
        cached?.status === "parsed" &&
        cached.summary &&
        cached.summary !== "—" &&
        !shouldRefetchParseSummary(cached.summary)
      ) {
        return;
      }
      if (cached?.status === "failed") {
        setParsedById((prev) => {
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      void runParse(file);
    },
    [canParseFile, parsedById, runParse],
  );

  const detail = useMemo(() => {
    if (selection.kind === "file" && selectedFileNode) {
      const file = selectedFileNode.file;
      const ui = parseUiStatus(
        file.id,
        parsedById,
        parsingId,
        Boolean(file.parsed),
      );
      const tags = tagsForFile(file, canDownload, ui);
      const statusTag =
        tags.find(
          (t) =>
            t.label === "已解析" ||
            t.label === "未解析" ||
            t.label === "解析中" ||
            t.label === "受限",
        ) ?? tags[0];
      const cache = parsedById[file.id];
      const trail = [
        ...folderPathTrail(fullTree, selectedFileNode.relativePath),
        { label: file.filename, path: `file:${file.id}` },
      ];
      let summary = "点击文件以解析（将调用大模型生成摘要）";
      if (ui === "parsing") summary = "正在调用大模型解析…";
      else if (cache?.status === "parsed") summary = cache.summary || "—";
      else if (cache?.status === "failed") summary = cache.summary || "解析失败";
      else if (file.parsed) summary = "已解析，加载详情中…";
      else if (file.scope === "package" && !canDownload) {
        summary = "当前权限受限，无法解析该文件";
      }

      const refLabels = cache?.refs ?? [];
      return {
        title: file.filename,
        trail,
        isFile: true as const,
        file,
        status: statusTag?.label ?? "未解析",
        perm:
          fileSourceBucket(file) === "session"
            ? "对话上传"
            : fileSourceBucket(file) === "issuer"
              ? "协作方上传"
              : fileSourceBucket(file) === "ai"
                ? "AI生成"
                : "",
        refs: refLabels.filter((r) => r.length <= 24 && !/https?:\/\//i.test(r)),
        summary,
        documentType: cache?.documentType || file.fileCategory || "",
        keyPoints: cache?.keyPoints ?? [],
        srcLines: [
          { label: "来源", value: SOURCE_BUCKETS.find((b) => b.id === fileSourceBucket(file))?.name ?? "项目上传" },
          { label: "时间", value: formatFileDate(file.createdAt) },
          ...(file.uploadedBy
            ? [{ label: "上传者", value: file.uploadedBy }]
            : []),
          { label: "大小", value: formatFileSize(file.sizeBytes) },
          { label: "主题", value: resolveFileTopic({
            filename: file.filename,
            relativePath: file.relativePath,
            fileCategory: file.fileCategory,
            documentType: cache?.documentType,
          }).label },
        ],
        canPreview: canDownload || file.scope === "session",
        canCreateSubfolder: false,
        canDeleteFolder: false,
        canUploadHere: false,
      };
    }

    const path = selection.kind === "folder" ? selection.path : "";
    const folder = selectedFolder ?? fullTree;
    const trail = folderPathTrail(fullTree, path);
    const bucket = sourceBucketFromVirtualPath(path);
    const canManageProjectFolder =
      canManage &&
      facet === "source" &&
      Boolean(path) &&
      bucket === "project";
    return {
      title: path === "" ? "源文件" : folder.name || path,
      trail,
      isFile: false as const,
      file: null as ProjectFileRecord | null,
      status: "",
      perm: "",
      refs: [] as string[],
      summary: "",
      documentType: "",
      keyPoints: [] as string[],
      srcLines: [] as { label: string; value: string }[],
      canPreview: false,
      canCreateSubfolder: canManageProjectFolder,
      canDeleteFolder: canManageProjectFolder && !isSourceRootPath(path),
      canUploadHere: canManageProjectFolder,
    };
  }, [
    selection,
    selectedFileNode,
    selectedFolder,
    fullTree,
    canDownload,
    canManage,
    parsedById,
    parsingId,
    facet,
  ]);

  const folderShareFiles = useMemo(() => {
    if (selection.kind !== "folder" || !selectedFolder) return [];
    return selectedFolder.children
      .filter((c): c is FileTreeFileNode => c.kind === "file")
      .map((c) => c.file)
      .filter((f) => canShareWithIssuer(f));
  }, [selection, selectedFolder]);

  const openPreview = (fileId: string) => {
    if (!canDownload) {
      const node = findFile(fullTree, fileId);
      if (node?.file.scope === "package") {
        setError("当前权限无法预览该文件（受限）");
        return;
      }
    }
    setPreviewFileId(fileId);
  };

  return (
    <section
      className="mt-1"
      aria-labelledby="project-materials-heading"
      onDragOver={(e) => {
        if (!canManage || !useLive) return;
        e.preventDefault();
        e.stopPropagation();
        if (dragOverPath === null) setDragOverPath("");
        const isMove = e.dataTransfer.types.includes(DND_DOC_MIME);
        e.dataTransfer.dropEffect = isMove ? "move" : "copy";
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOverPath(null);
      }}
      onDrop={(e) => {
        if (!canManage || !useLive) return;
        e.preventDefault();
        e.stopPropagation();
        const target =
            dragOverPath === null || dragOverPath === ""
            ? PROJECT_SOURCE_PATH
            : dragOverPath;
        setDragOverPath(null);
        acceptTreeDrop(e.dataTransfer, target);
      }}
    >
      <h3 id="project-materials-heading" className="sr-only">
        源文件
      </h3>

          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <label className="flex h-[38px] w-[260px] max-w-full items-center gap-2 rounded-[10px] border border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.8)] px-3.5 text-[13px] text-[hsl(var(--warm-charcoal-muted))]">
              <Search className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索源文件"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[hsl(var(--warm-charcoal))] outline-none placeholder:text-[#969E9A]"
              />
            </label>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as FileKindFilter)}
              className="h-[38px] rounded-[10px] border border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.6)] px-3 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))] outline-none"
            >
              <option value="all">全部类型</option>
              <option value="pdf">PDF</option>
              <option value="text">文本</option>
              <option value="other">其他</option>
            </select>
            <select
              value={parseFilter}
              onChange={(e) => setParseFilter(e.target.value as ParseFilter)}
              className="h-[38px] rounded-[10px] border border-[rgba(78,66,57,0.14)] bg-[rgba(255,252,248,0.6)] px-3 text-[12.5px] text-[hsl(var(--warm-charcoal-muted))] outline-none"
            >
              <option value="all">解析状态</option>
              <option value="parsed">已解析</option>
              <option value="unparsed">未解析</option>
            </select>
            <div className="flex-1" />
            {useLive && canManage ? (
              <UploadMenu
                disabled={busy}
                uploading={uploading}
                onSelectFiles={() => triggerFilePicker(PROJECT_SOURCE_PATH)}
                onSelectFolder={() => triggerFolderPicker(PROJECT_SOURCE_PATH)}
              />
            ) : null}
          </div>

          {loading ? (
            <p className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              加载资料列表…
            </p>
          ) : null}
          {error ? (
            <p className="mb-3 rounded-lg border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </p>
          ) : null}
          {uploadHint ? (
            <p className="mb-3 text-[12px] font-medium text-emerald-700">{uploadHint}</p>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)]">
            <div
              className={cn(
                "rounded-[18px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.78)] px-2.5 py-3 shadow-[0_10px_30px_rgba(102,80,60,0.07)]",
                dragOverPath === PROJECT_SOURCE_PATH && "ring-1 ring-[hsl(var(--wine)/0.35)]",
                dragOverPath === "" && "ring-1 ring-[hsl(var(--wine)/0.35)]",
              )}
            >
              <div className="px-1 pb-3">
                <div className="grid grid-cols-2 rounded-[10px] bg-[rgba(78,66,57,0.06)] p-0.5 text-[12px]">
                    <button
                      type="button"
                      onClick={() => setFacet("source")}
                      className={cn(
                        "h-7 rounded-md",
                        facet === "source"
                          ? "bg-white font-medium text-[#A06358] shadow-[0_1px_2px_rgba(78,66,57,0.08)]"
                          : "text-[#59625F]",
                      )}
                    >
                      来源
                    </button>
                    <button
                      type="button"
                      onClick={() => setFacet("topic")}
                      className={cn(
                        "h-7 rounded-md",
                        facet === "topic"
                          ? "bg-white font-medium text-[#A06358] shadow-[0_1px_2px_rgba(78,66,57,0.08)]"
                          : "text-[#59625F]",
                      )}
                    >
                      主题
                    </button>
                </div>
              </div>

              {!loading && tree.children.length === 0 ? (
                <p className="px-2.5 py-6 text-[12px] leading-relaxed text-[hsl(var(--warm-charcoal-muted))]">
                  {useLive
                    ? "暂无资料"
                    : "暂无资料列表。开启 Live 对话并上传后可见。"}
                </p>
              ) : null}

              <div className="max-h-[min(70vh,640px)] overflow-y-auto">
                {tree.children.map((node) => (
                  <TreeRow
                    key={node.kind === "folder" ? `f:${node.path}` : node.id}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    selection={selection}
                    canManage={useLive && canManage}
                    dragOverPath={dragOverPath}
                    setDragOverPath={setDragOverPath}
                    setExpanded={setExpanded}
                    setSelection={setSelection}
                    onSelectFile={selectFile}
                    onDropFiles={(files, path) => {
                      const bucket = sourceBucketFromVirtualPath(path);
                      if (bucket === "session" || bucket === "issuer" || bucket === "ai" || isTopicPath(path)) {
                        return;
                      }
                      void processUploadSelection(files, path);
                    }}
                    onDropDocument={(fileId, path) => {
                      const file = liveFiles?.find((f) => f.id === fileId);
                      if (file) void onMoveFile(file, path);
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-[360px] rounded-[18px] border border-[rgba(78,66,57,0.1)] bg-[rgba(255,252,248,0.78)] px-[30px] py-7 shadow-[0_10px_30px_rgba(102,80,60,0.07)]">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[hsl(var(--warm-charcoal-muted))]">
                    {detail.trail.map((p, i) => (
                      <span key={`${p.path}-${i}`} className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          className={cn(
                            i === detail.trail.length - 1
                              ? "cursor-default text-[hsl(var(--warm-charcoal-muted))]"
                              : "text-[hsl(var(--wine))] hover:underline",
                          )}
                          onClick={() => {
                            if (i === detail.trail.length - 1) return;
                            if (p.path.startsWith("file:")) return;
                            setSelection({ kind: "folder", path: p.path });
                          }}
                        >
                          {p.label}
                        </button>
                        {i < detail.trail.length - 1 ? (
                          <span className="text-[rgba(78,66,57,0.3)]">/</span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2.5 font-display text-2xl font-semibold">
                    {detail.title}
                  </div>
                </div>
                {detail.isFile && detail.file ? (
                <div className="flex shrink-0 items-center gap-3">
                  {canShareWithIssuer(detail.file) ? (
                    <IssuerShareTick
                      shared={Boolean(detail.file.sharedWithIssuer)}
                      disabled={!canManage || busy || sharingId === detail.file.id}
                      onChange={(next) => void onShareFile(detail.file!, next)}
                    />
                  ) : null}
                    <button
                      type="button"
                      disabled={!detail.canPreview}
                      onClick={() => openPreview(detail.file!.id)}
                      className="inline-flex h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] border border-[rgba(160,99,88,0.3)] bg-transparent px-[15px] text-[13px] font-medium text-[hsl(var(--wine))] hover:bg-[#EFE7E6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Eye className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                      预览文件
                    </button>
                </div>
                ) : null}
              </div>

              {detail.isFile ? (
                <p className="mt-2 text-[13px] text-[hsl(var(--warm-charcoal-muted))]">
                  {[detail.status, detail.perm].filter(Boolean).join(" · ")}
                </p>
              ) : null}

              {!detail.isFile && folderShareFiles.length > 0 ? (
                <div className="mt-6 divide-y divide-[rgba(78,66,57,0.08)] border-y border-[rgba(78,66,57,0.08)]">
                  {folderShareFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 py-2.5">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-[13px] text-[#1F2423] hover:text-[hsl(var(--wine))]"
                        onClick={() => selectFile(file)}
                      >
                        {file.filename}
                      </button>
                      {canManage ? (
                        <IssuerShareTick
                          shared={Boolean(file.sharedWithIssuer)}
                          disabled={busy || sharingId === file.id}
                          onChange={(next) => void onShareFile(file, next)}
                        />
                      ) : (
                        <span className="shrink-0 text-[12px] text-[hsl(var(--warm-charcoal-muted))]">
                          {file.sharedWithIssuer ? "协作方可见" : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {detail.isFile ? (
                <div className="mt-5 text-sm leading-[1.9] text-[hsl(var(--warm-charcoal))]">
                  {parsingId === detail.file?.id ? (
                    <span className="inline-flex items-center gap-2 text-[hsl(var(--warm-charcoal-muted))]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      {detail.summary}
                    </span>
                  ) : (
                    <>
                      {detail.documentType ? (
                        <div className="mb-2 text-[12px] text-[hsl(var(--warm-charcoal-muted))]">
                          {detail.documentType}
                        </div>
                      ) : null}
                      {detail.summary.trim() ? (
                        <ChatMarkdown text={detail.summary} variant="assistant" />
                      ) : (
                        <div>—</div>
                      )}
                      {detail.keyPoints.length > 0 ? (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-[hsl(var(--warm-charcoal))]">
                          {detail.keyPoints.map((p, i) => (
                            <li key={`${i}-${p.slice(0, 24)}`}>{p}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {detail.isFile && detail.srcLines.length > 0 ? (
                <div className="mt-[22px] flex flex-col gap-1.5 text-[13px] leading-snug">
                  {detail.srcLines.map((row) => (
                    <div key={row.label} className="flex gap-2">
                      <span className="w-11 shrink-0 text-[hsl(var(--warm-charcoal-muted))]">
                        {row.label}
                      </span>
                      <span className="min-w-0 break-all text-[hsl(var(--warm-charcoal))]">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {(detail.canCreateSubfolder ||
              detail.canDeleteFolder ||
              detail.canUploadHere ||
              detail.isFile) ? (
              <div className="mt-6 flex flex-wrap gap-2.5">
                {detail.canCreateSubfolder ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void onCreateFolder(
                        selection.kind === "folder" ? selection.path : "",
                      )
                    }
                    className="h-[38px] rounded-[10px] border border-[rgba(160,99,88,0.3)] bg-transparent px-4 text-[13px] font-medium text-[hsl(var(--wine))] hover:bg-[#EFE7E6] disabled:opacity-50"
                  >
                    新建文件夹
                  </button>
                ) : null}
                {detail.isFile &&
                detail.file &&
                canManage &&
                fileSourceBucket(detail.file) !== "issuer" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDeleteFile(detail.file!)}
                    className="h-[38px] rounded-[10px] border border-[rgba(78,66,57,0.16)] bg-transparent px-4 text-[13px] font-medium text-[hsl(var(--warm-charcoal-muted))] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                  >
                    删除
                  </button>
                ) : null}
                {detail.canDeleteFolder ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (selection.kind === "folder") {
                        void onDeleteFolder(selection.path);
                      }
                    }}
                    className="h-[38px] rounded-[10px] border border-[rgba(78,66,57,0.16)] bg-transparent px-4 text-[13px] font-medium text-[hsl(var(--warm-charcoal-muted))] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                  >
                    删除文件夹
                  </button>
                ) : null}
                {useLive && canManage && detail.canUploadHere ? (
                  <UploadMenu
                    disabled={busy}
                    uploading={uploading}
                    label="上传到此"
                    onSelectFiles={() =>
                      triggerFilePicker(selection.kind === "folder" ? selection.path : "")
                    }
                    onSelectFolder={() =>
                      triggerFolderPicker(selection.kind === "folder" ? selection.path : "")
                    }
                  />
                ) : null}
                {detail.isFile ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/app/chat/${projectId}`)}
                    className="h-[38px] rounded-[10px] bg-[hsl(var(--wine))] px-4 text-[13px] font-medium text-white hover:bg-[hsl(var(--wine-hover))]"
                  >
                    在对话中追问
                  </button>
                ) : null}
              </div>
              ) : null}
            </div>
          </div>

      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        multiple
        onChange={(e) => {
          void processUploadSelection(e.target.files, uploadTargetRef.current);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="sr-only"
        multiple
        onChange={(e) =>
          void onFolderInputChange(e.target.files, uploadTargetRef.current)
        }
      />

      {previewFileId ? (
        <FilePreviewModal
          projectId={projectId}
          userId={userId}
          file={findFile(fullTree, previewFileId)?.file ?? null}
          onClose={() => setPreviewFileId(null)}
          onDownload={
            canDownload ||
            findFile(fullTree, previewFileId)?.file.scope === "session"
              ? async () => {
                  const node = findFile(fullTree, previewFileId);
                  if (!node) return;
                  const { blob, filename } = await downloadFileBlob(
                    projectId,
                    node.file.id,
                    userId,
                    node.file.filename,
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename || node.file.filename;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

function IssuerShareTick({
  shared,
  disabled,
  onChange,
}: {
  shared: boolean;
  disabled?: boolean;
  onChange: (shared: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-[38px] shrink-0 items-center gap-1.5 text-[13px] text-[#1F2423]",
        disabled ? "cursor-default opacity-50" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-[hsl(var(--wine))]"
        checked={shared}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      协作方可见
    </label>
  );
}

function UploadMenu({
  disabled,
  uploading,
  label = "上传资料",
  onSelectFiles,
  onSelectFolder,
}: {
  disabled?: boolean;
  uploading?: boolean;
  label?: string;
  onSelectFiles: () => void;
  onSelectFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-[38px] items-center gap-1.5 rounded-[10px] bg-[hsl(var(--wine))] px-3.5 text-[12.5px] font-medium text-white hover:bg-[hsl(var(--wine-hover))]",
          disabled && "pointer-events-none opacity-60",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-3.5 w-3.5" aria-hidden />
        )}
        {label}
        <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
      </button>
      {open ? (
        <ul
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[9rem] rounded-lg border border-border/80 bg-white py-1 shadow-lg"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-muted/60"
              onClick={() => {
                onSelectFiles();
                setOpen(false);
              }}
            >
              选择文件…
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-muted/60"
              onClick={() => {
                onSelectFolder();
                setOpen(false);
              }}
            >
              选择文件夹…
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  selection,
  canManage,
  dragOverPath,
  setDragOverPath,
  setExpanded,
  setSelection,
  onSelectFile,
  onDropFiles,
  onDropDocument,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  selection: Selection;
  canManage: boolean;
  dragOverPath: string | null;
  setDragOverPath: (p: string | null) => void;
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
  setSelection: (s: Selection) => void;
  onSelectFile: (file: ProjectFileRecord) => void;
  onDropFiles: (files: FileList, path: string) => void;
  onDropDocument: (fileId: string, path: string) => void;
}) {
  if (node.kind === "file") {
    const selected = selection.kind === "file" && selection.id === node.id;
    const canDrag =
      canManage &&
      fileSourceBucket(node.file) === "project" &&
      node.file.scope === "package";
    return (
      <div
        role="button"
        tabIndex={0}
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag) return;
          const payload = JSON.stringify({ id: node.id });
          e.dataTransfer.setData(DND_DOC_MIME, payload);
          e.dataTransfer.setData("text/plain", node.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragOverPath(null)}
        onClick={() => onSelectFile(node.file)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelectFile(node.file);
          }
        }}
        className={cn(
          "flex h-[34px] items-center gap-2 rounded-[9px] pr-2.5",
          canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        )}
        style={{
          paddingLeft: 10 + depth * 18,
          background: selected ? "#EFE7E6" : "transparent",
          color: selected ? "#A06358" : "#4a524e",
        }}
        title={node.name}
      >
        <span className="w-3 shrink-0" />
        <FileText className="h-[15px] w-[15px] shrink-0 opacity-70" strokeWidth={1.8} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            selected ? "font-medium" : "font-normal",
          )}
        >
          {node.name}
        </span>
      </div>
    );
  }

  const open = expanded[node.path] ?? depth < 1;
  const selected = selection.kind === "folder" && selection.path === node.path;
  const bucket = sourceBucketFromVirtualPath(node.path);
  const noDrop =
    bucket === "session" || bucket === "issuer" || bucket === "ai" || isTopicPath(node.path);
  const isDrag = dragOverPath === node.path;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        className="flex h-[34px] cursor-pointer items-center gap-2 rounded-[9px] pr-2.5"
        style={{
          paddingLeft: 10 + depth * 18,
          background: isDrag
            ? "rgba(160,99,88,0.08)"
            : selected
              ? "#EFE7E6"
              : "transparent",
          color: selected ? "#A06358" : "#1F2423",
        }}
        onClick={() => {
          setSelection({ kind: "folder", path: node.path });
          setExpanded((prev) => ({ ...prev, [node.path]: !open }));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelection({ kind: "folder", path: node.path });
            setExpanded((prev) => ({ ...prev, [node.path]: !open }));
          }
        }}
        onDragOver={(e) => {
          if (noDrop || !canManage) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOverPath(node.path);
          const isMove = e.dataTransfer.types.includes(DND_DOC_MIME);
          e.dataTransfer.dropEffect = isMove ? "move" : "copy";
          if (!open) {
            setExpanded((prev) => ({ ...prev, [node.path]: true }));
          }
        }}
        onDragLeave={() => {
          if (dragOverPath === node.path) setDragOverPath(null);
        }}
        onDrop={(e) => {
          if (noDrop || !canManage) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOverPath(null);
          const raw = e.dataTransfer.getData(DND_DOC_MIME);
          if (raw) {
            try {
              const payload = JSON.parse(raw) as { id?: string };
              if (payload.id) onDropDocument(payload.id, node.path);
            } catch {
              /* ignore */
            }
            return;
          }
          onDropFiles(e.dataTransfer.files, node.path);
        }}
      >
        <span className="w-3 shrink-0 text-center text-[10px] text-[#9aa09c]">
          {node.children.length > 0 ? (open ? "▾" : "▸") : ""}
        </span>
        <Folder className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--wine))]" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={node.name}>
          {node.name}
        </span>
      </div>
      {open
        ? node.children.map((child) => (
            <TreeRow
              key={child.kind === "folder" ? `f:${child.path}` : child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selection={selection}
              canManage={canManage}
              dragOverPath={dragOverPath}
              setDragOverPath={setDragOverPath}
              setExpanded={setExpanded}
              setSelection={setSelection}
              onSelectFile={onSelectFile}
              onDropFiles={onDropFiles}
              onDropDocument={onDropDocument}
            />
          ))
        : null}
    </div>
  );
}

const FILE_MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-2 font-display text-[26px] font-semibold leading-snug text-[#1F2423] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-8 border-b border-[rgba(78,66,57,0.12)] pb-2 text-[17px] font-semibold text-[#1F2423]">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 text-[15px] font-semibold text-[#1F2423]">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[14.5px] leading-[1.9] text-[hsl(var(--warm-charcoal))] last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-4 list-outside list-disc space-y-1.5 pl-5 text-[14.5px] leading-[1.8] text-[hsl(var(--warm-charcoal))]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-outside list-decimal space-y-1.5 pl-5 text-[14.5px] leading-[1.8] text-[hsl(var(--warm-charcoal))]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[#1F2423]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-[3px] border-[hsl(var(--wine))]/40 bg-[hsl(var(--wine))]/[0.04] px-4 py-2 text-[14px] leading-relaxed text-[hsl(var(--warm-charcoal))]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-[rgba(78,66,57,0.12)]" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[hsl(var(--wine))] underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    if (className?.startsWith("language-")) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-[rgba(78,66,57,0.08)] px-1 py-0.5 font-mono text-[12.5px]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-xl bg-[rgba(78,66,57,0.06)] p-4 font-mono text-[12.5px] leading-relaxed text-[#1F2423]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-[rgba(78,66,57,0.12)]">
      <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[rgba(78,66,57,0.05)]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2.5 text-[12px] font-semibold text-[#1F2423]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-[rgba(78,66,57,0.08)] px-3 py-2.5 align-top leading-snug text-[hsl(var(--warm-charcoal))]">
      {children}
    </td>
  ),
  tr: ({ children }) => <tr className="even:bg-[rgba(78,66,57,0.03)]">{children}</tr>,
};

function FileMarkdownBody({ text }: { text: string }) {
  return (
    <div className="file-md-preview">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={FILE_MD_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function FilePreviewModal({
  projectId,
  userId,
  file,
  onClose,
  onDownload,
}: {
  projectId: string;
  userId: string;
  file: ProjectFileRecord | null;
  onClose: () => void;
  onDownload?: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "pdf" | "other">("other");

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const run = async () => {
      setLoading(true);
      setError(null);
      setText(null);
      setBlobUrl(null);
      try {
        const { blob } = await downloadFileBlob(
          projectId,
          file.id,
          userId,
          file.filename,
        );
        if (cancelled) return;
        const kind = classifyFileKind(file);
        if (kind === "text") {
          const raw = await blob.text();
          if (cancelled) return;
          setMode("text");
          setText(raw.length > 200_000 ? `${raw.slice(0, 200_000)}\n\n…（已截断）` : raw);
        } else if (kind === "pdf") {
          objectUrl = URL.createObjectURL(blob);
          setMode("pdf");
          setBlobUrl(objectUrl);
        } else {
          objectUrl = URL.createObjectURL(blob);
          setMode("other");
          setBlobUrl(objectUrl);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, projectId, userId]);

  if (!file) return null;
  const format = previewFormat(file);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="源文件预览"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,880px)] w-full max-w-[min(96vw,80rem)] flex-col overflow-hidden rounded-2xl border border-[rgba(78,66,57,0.12)] bg-[hsl(var(--paper))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(78,66,57,0.1)] px-4 py-3">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[#EFE7E6] text-[11px] font-bold text-[hsl(var(--wine))]">
            {format}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{file.filename}</div>
            <div className="mt-0.5 text-[11px] text-[hsl(var(--warm-charcoal-muted))]">
              {format} · 只读预览
            </div>
          </div>
          {onDownload ? (
            <button
              type="button"
              className="h-8 rounded-lg border border-[rgba(78,66,57,0.14)] px-3 text-xs text-[hsl(var(--warm-charcoal))] hover:bg-[rgba(78,66,57,0.05)]"
              onClick={() => void onDownload()}
            >
              下载
            </button>
          ) : null}
          <button
            type="button"
            aria-label="关闭预览"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(78,66,57,0.14)] bg-white text-[hsl(var(--warm-charcoal))] shadow-sm hover:bg-[rgba(78,66,57,0.06)]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex h-9 items-center justify-center gap-3.5 border-b border-[rgba(78,66,57,0.08)] text-[11.5px] text-[hsl(var(--warm-charcoal-muted))]">
          <span>第 1 / 1 页</span>
          <span className="h-3.5 w-px bg-[rgba(78,66,57,0.18)]" />
          <span>−</span>
          <span>100%</span>
          <span>+</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(248,243,238,0.45)] p-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载预览…
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          {!loading && !error && mode === "text" ? (
            <div className="mx-auto max-w-[720px] rounded-xl border border-[rgba(78,66,57,0.1)] bg-white px-8 py-10 shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b-2 border-[#1F2423] pb-4">
                <span className="text-[11px] tracking-wide text-[hsl(var(--wine))]">
                  源文件预览
                </span>
                <span className="font-mono text-[10px] text-[#969E9A]">{format}</span>
              </div>
              {isMarkdownFile(file) ? (
                <div className="mt-8">
                  <FileMarkdownBody text={text || ""} />
                </div>
              ) : (
                <>
                  <h1 className="mt-8 font-display text-[28px] font-semibold leading-snug">
                    {file.filename.replace(/\.[^.]+$/, "")}
                  </h1>
                  <div className="mt-2 mb-8 text-xs text-[hsl(var(--warm-charcoal-muted))]">
                    {file.scope === "session" ? "对话上传" : "项目资料包"} ·{" "}
                    {formatFileDate(file.createdAt)}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-[1.95] text-[hsl(var(--warm-charcoal))]">
                    {text || "—"}
                  </pre>
                </>
              )}
            </div>
          ) : null}
          {!loading && !error && mode === "pdf" && blobUrl ? (
            <iframe
              title={file.filename}
              src={blobUrl}
              className="h-[min(70vh,720px)] w-full rounded-xl border border-[rgba(78,66,57,0.1)] bg-white"
            />
          ) : null}
          {!loading && !error && mode === "other" ? (
            <div className="mx-auto max-w-lg rounded-xl border border-[rgba(78,66,57,0.1)] bg-white px-6 py-10 text-center">
              <FolderPlus className="mx-auto h-8 w-8 text-[hsl(var(--warm-charcoal-muted))]" />
              <p className="mt-4 text-sm text-[hsl(var(--warm-charcoal-muted))]">
                该类型暂不支持内联预览，请下载后查看。
              </p>
              {onDownload ? (
                <button
                  type="button"
                  className="mt-5 h-10 rounded-[10px] bg-[hsl(var(--wine))] px-5 text-sm font-medium text-white"
                  onClick={() => void onDownload()}
                >
                  下载文件
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
