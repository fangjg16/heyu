import assert from "node:assert/strict";
import { VL_IMAGE_RAW_MAX, visionImagesFromFileBytes } from "../src/chat-vision.ts";
import { encodePngRgba } from "../src/png-encode.ts";

const png = await encodePngRgba(1, 1, new Uint8Array([255, 0, 0, 255]), 4);
const small = await visionImagesFromFileBytes({
  fileName: "现场.png",
  mime: "image/png",
  bytes: png,
});
assert.equal(small.length, 1);
assert.match(small[0].dataUrl, /^data:image\/png;base64,/);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  assert.match(String(input), /\/__jfo\/internal\/image-compress/);
  return new Response(
    JSON.stringify({
      mime: "image/jpeg",
      dataUrl: "data:image/jpeg;base64,abc",
    }),
    { status: 200 },
  );
};
try {
  const bytes = new Uint8Array(VL_IMAGE_RAW_MAX + 8);
  const images = await visionImagesFromFileBytes({
    fileName: "04 岛屿总体规划图_StoneIsland Master Plan.jpg",
    mime: "image/jpeg",
    bytes,
    rasterEnv: {
      JFO_NODE_HELPER_BASE: "http://127.0.0.1:8791",
      JFO_INTERNAL_KEY: "k",
    },
  });
  assert.equal(images.length, 1);
  assert.equal(images[0].dataUrl, "data:image/jpeg;base64,abc");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("chat-vision-image-compress: ok");
