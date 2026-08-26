/**
 * 把拖放到源文件区的 DataTransfer 展开成真实 File。
 * Chrome / Edge 把文件夹拖进来时，`dataTransfer.files` 往往只有一个 0 字节、无后缀的目录占位，
 * 真正内容必须走 `webkitGetAsEntry()` 递归读取。
 */

export type DropFsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (
    successCallback: (file: File) => void,
    errorCallback?: (err: DOMException) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      successCallback: (entries: DropFsEntry[]) => void,
      errorCallback?: (err: DOMException) => void,
    ) => void;
  };
};

export type DropSnapshot = {
  entries: DropFsEntry[];
  files: File[];
};

export function fileWithRelativePath(file: File, relativePath: string): File {
  const normalized = relativePath.replace(/\\/gu, "/").replace(/^\/+/u, "");
  const current = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (current === normalized) return file;
  try {
    Object.defineProperty(file, "webkitRelativePath", {
      value: normalized,
      configurable: true,
    });
    if ((file as File & { webkitRelativePath?: string }).webkitRelativePath === normalized) {
      return file;
    }
  } catch {
    /* 某些浏览器把 webkitRelativePath 做成只读 getter */
  }
  const copy = new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
  Object.defineProperty(copy, "webkitRelativePath", {
    value: normalized,
    configurable: true,
  });
  return copy;
}

/** Chrome 把拖入的文件夹当成 size=0、无 MIME、无扩展名的假文件 */
export function isLikelyDirectoryPlaceholder(file: File): boolean {
  if (file.size > 0) return false;
  if (file.type) return false;
  const webkit = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (webkit && webkit.includes("/")) return false;
  return !file.name.includes(".");
}

export function shouldSkipDroppedPath(relativePath: string): boolean {
  const p = relativePath.replace(/\\/gu, "/");
  if (!p || p.endsWith("/")) return true;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((seg) => seg === "__MACOSX" || seg.startsWith("._"))) return true;
  const base = parts[parts.length - 1] ?? "";
  if (base === ".DS_Store" || base === "Thumbs.db") return true;
  return false;
}

function asDropEntry(entry: FileSystemEntry): DropFsEntry {
  return entry as unknown as DropFsEntry;
}

/**
 * 必须在 drop 事件回调里同步调用：await 之后 items 可能被浏览器清空。
 */
export function snapshotDroppedEntries(dt: DataTransfer): DropSnapshot {
  const entries: DropFsEntry[] = [];
  const items = dt.items;
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.kind && item.kind !== "file") continue;
      const getEntry = (
        item as DataTransferItem & {
          webkitGetAsEntry?: () => FileSystemEntry | null;
        }
      ).webkitGetAsEntry;
      const entry = typeof getEntry === "function" ? getEntry.call(item) : null;
      if (entry) entries.push(asDropEntry(entry));
    }
  }
  return {
    entries,
    files: Array.from(dt.files ?? []),
  };
}

async function readAllDirectoryEntries(reader: {
  readEntries: (
    successCallback: (entries: DropFsEntry[]) => void,
    errorCallback?: (err: DOMException) => void,
  ) => void;
}): Promise<DropFsEntry[]> {
  const all: DropFsEntry[] = [];
  for (;;) {
    const batch = await new Promise<DropFsEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, (err) => reject(err));
    });
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(
  entry: DropFsEntry,
  prefix: string,
  out: File[],
): Promise<void> {
  const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    if (shouldSkipDroppedPath(rel)) return;
    const file = await new Promise<File>((resolve, reject) => {
      if (!entry.file) {
        reject(new Error("无法读取拖入的文件"));
        return;
      }
      entry.file(resolve, (err) => reject(err));
    });
    out.push(fileWithRelativePath(file, rel));
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  const children = await readAllDirectoryEntries(entry.createReader());
  await Promise.all(children.map((child) => walkEntry(child, rel, out)));
}

export async function collectDroppedFiles(snapshot: DropSnapshot): Promise<File[]> {
  if (snapshot.entries.length > 0) {
    const fromEntries: File[] = [];
    await Promise.all(
      snapshot.entries.map((entry) => walkEntry(entry, "", fromEntries)),
    );
    if (fromEntries.length > 0) return fromEntries;
  }
  return snapshot.files.filter((file) => !isLikelyDirectoryPlaceholder(file));
}
