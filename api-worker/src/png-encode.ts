/** 无依赖 PNG 编码（扫描 PDF 抽图后送给视觉模型） */

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

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const stream = new Blob([data]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * 将 raw 像素编成 PNG。channels: 1=灰, 3=RGB, 4=RGBA。
 */
export async function encodePngRgba(
  width: number,
  height: number,
  pixels: ArrayLike<number>,
  channels: 1 | 3 | 4,
): Promise<Uint8Array> {
  if (width < 1 || height < 1) throw new Error("invalid png size");
  const expected = width * height * channels;
  if (pixels.length < expected) {
    throw new Error(`png pixels short: ${pixels.length} < ${expected}`);
  }
  const src = pixels instanceof Uint8Array ? pixels : Uint8Array.from(pixels);
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false);
  dv.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const stride = width * channels;
  const raw = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const o = y * (1 + stride);
    raw[o] = 0;
    raw.set(src.subarray(y * stride, y * stride + stride), o + 1);
  }
  const deflated = await zlibDeflate(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", deflated), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
