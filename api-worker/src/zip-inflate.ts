/** 轻量 ZIP 解压（stored + deflate）。与前端 `src/lib/zip-unzip.ts` 算法一致，供 Worker/Node 使用。 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function readU16(data: Uint8Array, off: number): number {
  return data[off]! | (data[off + 1]! << 8);
}

function readU32(data: Uint8Array, off: number): number {
  return (
    (data[off]! |
      (data[off + 1]! << 8) |
      (data[off + 2]! << 16) |
      (data[off + 3]! << 24)) >>>
    0
  );
}

async function decompressWithFormat(
  compressed: Uint8Array,
  format: "deflate-raw" | "deflate",
): Promise<Uint8Array> {
  const buffer = await new Response(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream(format)),
  ).arrayBuffer();
  return new Uint8Array(buffer);
}

async function inflateZip(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前运行时不支持 ZIP 解压（缺少 DecompressionStream）");
  }
  if (compressed.byteLength === 0) return new Uint8Array(0);

  let lastErr: unknown;
  for (const format of ["deflate-raw", "deflate"] as const) {
    try {
      return await decompressWithFormat(compressed, format);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("ZIP deflate 解压失败");
}

function findEocdOffset(data: Uint8Array): number {
  const min = Math.max(0, data.byteLength - 65557);
  for (let i = data.byteLength - 22; i >= min; i--) {
    if (readU32(data, i) === SIG_EOCD) return i;
  }
  return -1;
}

/**
 * 解压 ZIP 为 path -> bytes（路径用 /，无 leading /）。
 * 支持 compression 0 (stored) 与 8 (deflate)。
 */
export async function unzipToEntries(
  data: Uint8Array,
): Promise<Record<string, Uint8Array>> {
  const eocd = findEocdOffset(data);
  if (eocd < 0) {
    throw new Error("无法解压 ZIP，文件可能已损坏或不是有效压缩包");
  }

  const cdCount = readU16(data, eocd + 10);
  const cdOffset = readU32(data, eocd + 16);
  const out: Record<string, Uint8Array> = {};

  let pos = cdOffset;
  for (let i = 0; i < cdCount && pos + 46 <= data.byteLength; i++) {
    if (readU32(data, pos) !== SIG_CENTRAL) break;

    const method = readU16(data, pos + 10);
    const compSize = readU32(data, pos + 20);
    const uncompSize = readU32(data, pos + 24);
    const nameLen = readU16(data, pos + 28);
    const extraLen = readU16(data, pos + 30);
    const commentLen = readU16(data, pos + 32);
    const localOffset = readU32(data, pos + 42);

    const nameStart = pos + 46;
    const nameBytes = data.subarray(nameStart, nameStart + nameLen);
    const path = new TextDecoder().decode(nameBytes).replace(/\\/gu, "/");
    pos = nameStart + nameLen + extraLen + commentLen;

    if (!path || path.endsWith("/")) continue;

    if (readU32(data, localOffset) !== SIG_LOCAL) {
      throw new Error(`ZIP 条目损坏：${path}`);
    }

    const localNameLen = readU16(data, localOffset + 26);
    const localExtraLen = readU16(data, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;

    let useCompSize = compSize;
    let useUncompSize = uncompSize;
    const localCompSize = readU32(data, localOffset + 18);
    const localUncompSize = readU32(data, localOffset + 22);
    if (useCompSize === 0 && localCompSize > 0) useCompSize = localCompSize;
    if (useUncompSize === 0 && localUncompSize > 0) useUncompSize = localUncompSize;

    const compressed = data.subarray(dataStart, dataStart + useCompSize);

    let raw: Uint8Array;
    if (method === 0) {
      raw = compressed;
    } else if (method === 8) {
      raw = await inflateZip(compressed);
    } else {
      throw new Error(`ZIP 内「${path}」使用了不支持的压缩方式 (${method})`);
    }

    void useUncompSize;
    out[path] = raw;
  }

  if (Object.keys(out).length === 0) {
    throw new Error("ZIP 内没有可解析的文件");
  }
  return out;
}

export function shouldSkipZipEntry(path: string): boolean {
  const p = path.replace(/\\/gu, "/");
  if (!p || p.endsWith("/")) return true;
  const parts = p.split("/").filter(Boolean);
  if (parts.some((seg) => seg === "__MACOSX" || seg.startsWith("._"))) return true;
  const base = parts[parts.length - 1] ?? "";
  if (base === ".DS_Store" || base === "Thumbs.db") return true;
  return false;
}
