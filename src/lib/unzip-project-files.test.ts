import { describe, expect, it } from "vitest";
import {
  expandZipsInUploadItems,
  relativePathFromWebkitFile,
  unzipProjectPackageFiles,
} from "./unzip-project-files";

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(entries: Record<string, Uint8Array | string>): Uint8Array {
  const files = Object.entries(entries).map(([name, data]) => ({
    name,
    data: typeof data === "string" ? new TextEncoder().encode(data) : data,
  }));
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + nameBytes.length + f.data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, f.data.length, true);
    view.setUint32(22, f.data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(f.data, 30 + nameBytes.length);
    locals.push(local);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const l of locals) {
    out.set(l, p);
    p += l.length;
  }
  for (const c of centrals) {
    out.set(c, p);
    p += c.length;
  }
  out.set(eocd, p);
  return out;
}

function zipFile(name: string, entries: Record<string, Uint8Array | string>): File {
  const bytes = makeStoredZip(entries);
  return new File([bytes], name, { type: "application/zip" });
}

describe("unzipProjectPackageFiles", () => {
  it("uses the zip stem as the new folder under the target", async () => {
    const file = zipFile("04_附件存档.zip", {
      "纪要.txt": "minutes",
      "__MACOSX/._纪要.txt": "skip",
    });
    const items = await unzipProjectPackageFiles(file, "项目上传的");
    expect(items).toHaveLength(1);
    expect(items[0]?.file.name).toBe("纪要.txt");
    expect(items[0]?.relativePath).toBe("项目上传的/04_附件存档");
  });
});

describe("expandZipsInUploadItems", () => {
  it("unzips a zip sitting next to other files", async () => {
    const zip = zipFile("pack.zip", { "a.txt": "AAA" });
    const pdf = new File(["%PDF"], "x.pdf", { type: "application/pdf" });
    const items = await expandZipsInUploadItems([
      { file: zip, relativePath: "项目上传的" },
      { file: pdf, relativePath: "项目上传的" },
    ]);
    expect(items.map((i) => i.file.name).sort()).toEqual(["a.txt", "x.pdf"]);
    expect(items.find((i) => i.file.name === "a.txt")?.relativePath).toBe(
      "项目上传的/pack",
    );
  });

  it("unzips a zip inside a folder selection (webkit path parent)", async () => {
    const zip = zipFile("inner.zip", { "nested/b.md": "# hi" });
    const items = await expandZipsInUploadItems([
      { file: zip, relativePath: "项目上传的/资料包" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.file.name).toBe("b.md");
    expect(items[0]?.relativePath).toBe("项目上传的/资料包/inner/nested");
  });

  it("recursively unzips a zip nested in another zip", async () => {
    const inner = makeStoredZip({ "deep.txt": "DEEP" });
    const outer = zipFile("outer.zip", { "inner.zip": inner });
    const items = await expandZipsInUploadItems([
      { file: outer, relativePath: "项目上传的" },
    ]);
    expect(items.map((i) => i.file.name)).toEqual(["deep.txt"]);
    expect(items[0]?.relativePath).toBe("项目上传的/outer/inner");
  });
});

describe("relativePathFromWebkitFile", () => {
  it("keeps the folder tree under the upload target", () => {
    const file = new File(["x"], "附录.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "资料/附件/附录.txt",
    });
    expect(relativePathFromWebkitFile(file, "项目上传的")).toBe("项目上传的/资料/附件");
  });
});
