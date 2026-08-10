/** 用 JFO_INTERNAL_KEY 派生 AES-GCM，加密 platform_llm_settings.api_key_enc */

const PREFIX = "v1:";

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function requireEncryptionSecret(jfoInternalKey: string | undefined): string {
  const secret = (jfoInternalKey ?? "").trim();
  if (!secret) {
    throw new Error(
      "未配置 JFO_INTERNAL_KEY，无法加密存储 API Key。请先在 API 环境变量中设置。",
    );
  }
  return secret;
}

export async function encryptApiKey(
  jfoInternalKey: string,
  plaintext: string,
): Promise<string> {
  const secret = requireEncryptionSecret(jfoInternalKey);
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return `${PREFIX}${bytesToBase64(packed)}`;
}

export async function decryptApiKey(
  jfoInternalKey: string,
  enc: string,
): Promise<string> {
  const secret = requireEncryptionSecret(jfoInternalKey);
  const raw = (enc ?? "").trim();
  if (!raw.startsWith(PREFIX)) {
    throw new Error("API Key 密文格式无效");
  }
  const packed = base64ToBytes(raw.slice(PREFIX.length));
  if (packed.length < 13) {
    throw new Error("API Key 密文损坏");
  }
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const key = await deriveAesKey(secret);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export function apiKeyHintFromPlaintext(plaintext: string): string {
  const t = plaintext.trim();
  if (!t) return "";
  return t.length <= 4 ? t : t.slice(-4);
}

export function formatApiKeyMask(hint: string | null | undefined): string {
  const h = (hint ?? "").trim();
  if (!h) return "";
  return `****${h}`;
}
