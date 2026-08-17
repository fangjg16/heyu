const AVATAR_SIZE = 192;
const AVATAR_QUALITY = 0.82;
const AVATAR_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const AVATAR_MAX_DATA_URL = 180_000;

function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    img.src = url;
  });
}

/** 将上传图片裁成正方形 JPEG data URL，便于存库与展示。 */
export async function resizeImageToJpegDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  if (file.size > AVATAR_MAX_SOURCE_BYTES) {
    throw new Error("图片不能超过 8MB");
  }

  const source = await loadImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");

  const sw = "width" in source ? source.width : AVATAR_SIZE;
  const sh = "height" in source ? source.height : AVATAR_SIZE;
  const scale = Math.max(AVATAR_SIZE / sw, AVATAR_SIZE / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (AVATAR_SIZE - dw) / 2, (AVATAR_SIZE - dh) / 2, dw, dh);
  if ("close" in source && typeof source.close === "function") {
    source.close();
  }

  let dataUrl = canvas.toDataURL("image/jpeg", AVATAR_QUALITY);
  if (dataUrl.length > AVATAR_MAX_DATA_URL) {
    dataUrl = canvas.toDataURL("image/jpeg", 0.62);
  }
  if (dataUrl.length > AVATAR_MAX_DATA_URL) {
    throw new Error("头像压缩后仍过大，请换一张更简单的图片");
  }
  return dataUrl;
}
