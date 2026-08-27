import { unzipToEntries } from "@/lib/zip-unzip";
import { joinRelativePath, normalizeRelativePath } from "@/lib/project-file-tree";

export type UnzippedProjectFile = {
  file: File;
  /** 父目录相对路径（不含文件名） */
  relativePath: string;
};

export const MAX_ZIP_DEPTH = 3;
export const MAX_UNZIPPED_FILES = 200;

function shouldSkipZipEntry(path: string): boolean {
  const p = path.replace(/\\/gu, "/");
  if (!p || p.endsWith("/")) return true;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((seg) => seg === "__MACOSX" || seg.startsWith("._"))) return true;
  const base = parts[parts.length - 1] ?? "";
  if (base === ".DS_Store" || base === "Thumbs.db") return true;
  return false;
}

export function isZipFileName(name: string, mime?: string | null): boolean {
  const lower = name.toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (lower.endsWith(".zip")) return true;
  return (
    m === "application/zip" ||
    m === "application/x-zip-compressed" ||
    m === "application/x-zip"
  );
}

export function guessMimeFromFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".docx") || lower.endsWith(".dotx") || lower.endsWith(".docm")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc") || lower.endsWith(".dot")) return "application/msword";
  if (lower.endsWith(".eml")) return "message/rfc822";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".jpe")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

/** @deprecated 使用 guessMimeFromFileName */
function guessMime(name: string): string {
  return guessMimeFromFileName(name);
}

/**
 * 解压 zip：展开到以 zip 文件名（去 .zip）为根的目录下。
 * 不保留 zip 本体；跳过目录项与系统垃圾文件。不递归解嵌套 zip（见 expandZipsInUploadItems）。
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

/**
 * 把选择/拖入的文件里每一个 zip（含文件夹内、多文件混合、嵌套 zip）展开成普通文件。
 * 解压失败的 zip 会原样保留，以免资料丢失。
 */
export async function expandZipsInUploadItems(
  items: UnzippedProjectFile[],
  options?: { depth?: number; warnings?: string[] },
): Promise<UnzippedProjectFile[]> {
  const depth = options?.depth ?? 0;
  const warnings = options?.warnings ?? [];
  const out: UnzippedProjectFile[] = [];

  for (const item of items) {
    if (out.length >= MAX_UNZIPPED_FILES) {
      warnings.push(`解压后文件超过 ${MAX_UNZIPPED_FILES} 个，其余已跳过`);
      break;
    }
    if (!isZipFileName(item.file.name, item.file.type)) {
      out.push(item);
      continue;
    }
    if (depth >= MAX_ZIP_DEPTH) {
      warnings.push(`嵌套 ZIP 超过 ${MAX_ZIP_DEPTH} 层，已跳过 ${item.file.name}`);
      continue;
    }
    try {
      const nested = await unzipProjectPackageFiles(item.file, item.relativePath);
      const expanded = await expandZipsInUploadItems(nested, {
        depth: depth + 1,
        warnings,
      });
      for (const child of expanded) {
        if (out.length >= MAX_UNZIPPED_FILES) {
          warnings.push(`解压后文件超过 ${MAX_UNZIPPED_FILES} 个，其余已跳过`);
          break;
        }
        out.push(child);
      }
    } catch (e) {
      warnings.push(
        `${item.file.name}：${e instanceof Error ? e.message : String(e)}`,
      );
      out.push(item);
    }
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
  if (parts.length <= 1) return normalizeRelativePath(targetFolder);
  const parentInPicker = parts.slice(0, -1).join("/");
  return joinRelativePath(targetFolder, parentInPicker);
}
