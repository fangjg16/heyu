import { unzipToEntries } from "@/lib/zip-unzip";
import { joinRelativePath, normalizeRelativePath } from "@/lib/project-file-tree";

export type UnzippedProjectFile = {
  file: File;
  /** 父目录相对路径（不含文件名） */
  relativePath: string;
};

function shouldSkipZipEntry(path: string): boolean {
  const p = path.replace(/\\/gu, "/");
  if (!p || p.endsWith("/")) return true;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((seg) => seg === "__MACOSX" || seg.startsWith("._"))) return true;
  const base = parts[parts.length - 1] ?? "";
  if (base === ".DS_Store" || base === "Thumbs.db") return true;
  return false;
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

/**
 * 解压 zip：展开到以 zip 文件名（去 .zip）为根的目录下。
 * 不保留 zip 本体；跳过目录项与系统垃圾文件。
 */
export async function unzipProjectPackageFiles(
  zipFile: File,
  baseFolder = "",
): Promise<UnzippedProjectFile[]> {
  const buf = new Uint8Array(await zipFile.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipToEntries(buf);
  } catch (e) {
    throw new Error(
      e instanceof Error ? e.message : "无法解压 ZIP，文件可能已损坏或不是有效压缩包",
    );
  }

  const zipStem = zipFile.name.replace(/\.zip$/iu, "").trim() || "archive";
  const root = joinRelativePath(baseFolder, normalizeRelativePath(zipStem));
  const out: UnzippedProjectFile[] = [];

  for (const [entryPath, data] of Object.entries(entries)) {
    if (shouldSkipZipEntry(entryPath)) continue;
    const normalized = normalizeRelativePath(entryPath);
    if (!normalized) continue;
    const parts = normalized.split("/");
    const filename = parts[parts.length - 1]!;
    const entryParent = parts.slice(0, -1).join("/");
    const relativePath = joinRelativePath(root, entryParent);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    out.push({
      file: new File([copy], filename, { type: guessMime(filename) }),
      relativePath,
    });
  }

  if (out.length === 0) {
    throw new Error("ZIP 内没有可上传的文件");
  }
  return out;
}

/** 从浏览器文件夹选择（webkitRelativePath）拆出相对父目录 */
export function relativePathFromWebkitFile(
  file: File,
  targetFolder = "",
): string {
  const webkit = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!webkit) return normalizeRelativePath(targetFolder);
  const parts = normalizeRelativePath(webkit).split("/");
  // webkitRelativePath = folderRoot/.../filename — 去掉顶层文件夹名与文件名，保留中间；
  // 实际上整个相对路径（去掉 basename）叠到 targetFolder 上，并保留顶层文件夹名
  if (parts.length <= 1) return normalizeRelativePath(targetFolder);
  const parentInPicker = parts.slice(0, -1).join("/");
  return joinRelativePath(targetFolder, parentInPicker);
}
