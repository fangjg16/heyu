/**
 * Node 侧把过大的 jpg/png 压到视觉模型可收的体积（workerd 没有 @napi-rs/canvas）。
 * 图片本身走 image_url，不要套 PDF「整页画 PNG」那条路。
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";

export const IMAGE_COMPRESS_MAX_INPUT_BYTES = 40 * 1024 * 1024;
export const IMAGE_COMPRESS_MAX_EDGE = 2048;
export const IMAGE_COMPRESS_MAX_BYTES = 7 * 1024 * 1024;

function asBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(src);
}

/**
 * @param {Uint8Array | ArrayBuffer | Buffer} bytes
 * @param {{ maxEdge?: number, maxBytes?: number }} [opts]
 * @returns {Promise<{ mime: string, bytes: Uint8Array, width: number, height: number } | null>}
 */
export async function compressImageForVision(bytes, opts = {}) {
  const src = asBuffer(bytes);
  if (src.byteLength === 0) return null;
  if (src.byteLength > IMAGE_COMPRESS_MAX_INPUT_BYTES) {
    throw new Error(
      `图片约 ${(src.byteLength / 1024 / 1024).toFixed(1)} MB，超过压缩上限`,
    );
  }
  const maxEdge = Number(opts.maxEdge) > 0 ? Number(opts.maxEdge) : IMAGE_COMPRESS_MAX_EDGE;
  const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : IMAGE_COMPRESS_MAX_BYTES;

  const img = await loadImage(src);
  const srcW = img.width;
  const srcH = img.height;
  if (!srcW || !srcH) return null;

  const fit = (edge) => {
    const scale = Math.min(1, edge / Math.max(srcW, srcH));
    return {
      w: Math.max(1, Math.round(srcW * scale)),
      h: Math.max(1, Math.round(srcH * scale)),
    };
  };

  let edge = Math.min(maxEdge, Math.max(srcW, srcH));
  let quality = 85;
  for (let attempt = 0; attempt < 8; attempt++) {
    const dim = fit(edge);
    const canvas = createCanvas(dim.w, dim.h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, dim.w, dim.h);
    const out = Buffer.from(await canvas.encode("jpeg", quality));
    if (out.byteLength <= maxBytes) {
      return {
        mime: "image/jpeg",
        bytes: new Uint8Array(out),
        width: dim.w,
        height: dim.h,
      };
    }
    if (quality > 50) {
      quality -= 15;
    } else {
      edge = Math.max(640, Math.round(edge * 0.7));
      quality = 70;
    }
  }
  return null;
}

export function jpegBytesToDataUrl(bytes) {
  return `data:image/jpeg;base64,${asBuffer(bytes).toString("base64")}`;
}
