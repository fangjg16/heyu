import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import {
  IMAGE_COMPRESS_MAX_BYTES,
  compressImageForVision,
} from "./image-compress.mjs";

const canvas = createCanvas(2800, 1800);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#1a4a7a";
ctx.fillRect(0, 0, 2800, 1800);
for (let i = 0; i < 6000; i++) {
  ctx.fillStyle = `rgb(${i % 255},${(i * 13) % 255},${(i * 29) % 180})`;
  ctx.fillRect((i * 37) % 2800, (i * 19) % 1800, 12, 8);
}
const raw = Buffer.from(await canvas.encode("jpeg", 95));
assert.ok(raw.byteLength > 20_000, `fixture too small: ${raw.byteLength}`);

const out = await compressImageForVision(raw, { maxEdge: 1024, maxBytes: IMAGE_COMPRESS_MAX_BYTES });
assert.ok(out, "compressImageForVision returned null");
assert.equal(out.mime, "image/jpeg");
assert.ok(out.width <= 1024 && out.height <= 1024);
assert.ok(out.bytes.byteLength > 0);
assert.ok(out.bytes.byteLength <= IMAGE_COMPRESS_MAX_BYTES);
assert.ok(out.bytes.byteLength < raw.byteLength);

console.log("image-compress: ok");
