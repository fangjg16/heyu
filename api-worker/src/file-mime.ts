/** 按扩展名判断资料类型，供上传解析派发（不依赖浏览器 File.type）。 */

export function fileExtName(fileName: string): string {
  const base = fileName.split(/[/\\]/u).pop() || fileName;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function guessMimeFromFileName(name: string): string {
  const ext = fileExtName(name);
  switch (ext) {
    case "txt":
    case "log":
      return "text/plain";
    case "md":
    case "markdown":
      return "text/markdown";
    case "html":
    case "htm":
      return "text/html";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
    case "pdf":
      return "application/pdf";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "docx":
    case "dotx":
    case "docm":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
    case "dot":
      return "application/msword";
    case "eml":
      return "message/rfc822";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
    case "jpe":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "heic":
      return "image/heic";
    case "zip":
      return "application/zip";
    default:
      return "application/octet-stream";
  }
}

export function isZipFileName(name: string, mime?: string | null): boolean {
  const m = (mime ?? "").toLowerCase();
  if (fileExtName(name) === "zip") return true;
  return (
    m === "application/zip" ||
    m === "application/x-zip-compressed" ||
    m === "application/x-zip"
  );
}

export function isPdfFileName(name: string, mime?: string | null): boolean {
  const m = (mime ?? "").toLowerCase();
  return fileExtName(name) === "pdf" || m === "application/pdf" || m.includes("pdf");
}

export function isSpreadsheetFileName(name: string, mime?: string | null): boolean {
  const ext = fileExtName(name);
  const m = (mime ?? "").toLowerCase();
  return (
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "xlsm" ||
    m.includes("spreadsheet") ||
    m === "application/vnd.ms-excel"
  );
}

export function isDocxFileName(name: string, mime?: string | null): boolean {
  const ext = fileExtName(name);
  const m = (mime ?? "").toLowerCase();
  return (
    ext === "docx" ||
    ext === "dotx" ||
    ext === "docm" ||
    m.includes("wordprocessingml")
  );
}

export function isDocFileName(name: string, mime?: string | null): boolean {
  const ext = fileExtName(name);
  const m = (mime ?? "").toLowerCase();
  if (isDocxFileName(name, mime)) return false;
  return ext === "doc" || ext === "dot" || m === "application/msword";
}

export function isEmlFileName(name: string, mime?: string | null): boolean {
  const ext = fileExtName(name);
  const m = (mime ?? "").toLowerCase();
  return (
    ext === "eml" ||
    m === "message/rfc822" ||
    m === "message/rfc2822" ||
    m.includes("rfc822")
  );
}

export function isImageFileName(name: string, mime?: string | null): boolean {
  const ext = fileExtName(name);
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return true;
  return ["png", "jpg", "jpeg", "jpe", "gif", "webp", "bmp", "tif", "tiff", "heic"].includes(
    ext,
  );
}

export function isPlainTextFileName(name: string, mime?: string | null): boolean {
  const ext = fileExtName(name);
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("text/")) return true;
  if (m === "application/json" || m === "application/xml" || m === "application/javascript") {
    return true;
  }
  return ["txt", "md", "markdown", "html", "htm", "csv", "json", "xml", "log"].includes(ext);
}

export function zipMagic(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function oleMagic(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}
