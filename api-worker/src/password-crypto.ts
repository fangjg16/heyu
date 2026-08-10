/** PBKDF2-SHA256 密码哈希（Worker Web Crypto + Node 种子脚本共用逻辑约定） */

export const DEFAULT_PBKDF2_ITERS = 120_000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function hashPassword(
  password: string,
  saltHex?: string,
  iterations = DEFAULT_PBKDF2_ITERS,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt =
    saltHex && saltHex.length >= 16
      ? hexToBytes(saltHex)
      : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return {
    hash: bytesToHex(new Uint8Array(bits)),
    salt: bytesToHex(salt),
    iterations,
  };
}

export async function verifyPassword(
  password: string,
  hashHex: string,
  saltHex: string,
  iterations: number,
): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex, iterations);
  if (hash.length !== hashHex.length) return false;
  let ok = 0;
  for (let i = 0; i < hash.length; i++) {
    ok |= hash.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return ok === 0;
}

export async function sha256Hex(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return bytesToHex(new Uint8Array(buf));
}

export function randomToken(bytes = 32): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}
