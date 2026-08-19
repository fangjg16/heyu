/**
 * workerd/Miniflare 在 Docker 里经常解析不了 Compose 服务名
 *（getaddrinfo: Temporary failure in name resolution）。
 * Node 能用 127.0.0.11，启动时把 mysql-bridge / minio 等单标签主机名换成 IPv4 再交给 Worker。
 * Hermes 不在这里改 IP：workerd 直连 172.x 会变成 internal error，改由 http-server Node 反代。
 */
import dns from "node:dns/promises";

export const WORKERD_URL_ENV_KEYS = [
  "MYSQL_BRIDGE_URL",
  "MINIO_ENDPOINT",
  "SKILLS_BRIDGE_URL",
];

export function isDockerServiceHostname(hostname) {
  if (!hostname) return false;
  const host = String(hostname).trim().toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return false;
  if (host.includes(":")) return false;
  return !host.includes(".");
}

export function applyResolvedHostname(raw, ip) {
  const u = new URL(raw);
  const hadTrailing = String(raw).endsWith("/");
  u.hostname = ip;
  let href = u.href;
  if (!hadTrailing && href.endsWith("/") && u.pathname === "/") {
    href = href.slice(0, -1);
  }
  return href;
}

export async function lookupIpv4(hostname, lookup = dns.lookup, attempts = 20, delayMs = 1000) {
  let lastErr;
  const wait = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1000;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await lookup(hostname, { family: 4 });
      const address = typeof result === "string" ? result : result?.address;
      if (address) return address;
      throw new Error("empty address");
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1 && wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr ?? new Error(`DNS lookup failed: ${hostname}`);
}

const hostnameCache = new Map();
const HOST_TTL_MS = 15_000;

export function clearDockerHostnameCache() {
  hostnameCache.clear();
}

/** Node fetch 直接查 hermes 常 EAI_AGAIN；请求时用 family:4 解析再打 IP。 */
export async function resolveDockerServiceUrl(rawUrl, lookup = dns.lookup) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (!isDockerServiceHostname(parsed.hostname)) return raw;
  const host = parsed.hostname;
  const now = Date.now();
  const hit = hostnameCache.get(host);
  let ip = hit && now - hit.at < HOST_TTL_MS ? hit.ip : "";
  if (!ip) {
    ip = await lookupIpv4(host, lookup, 8, 250);
    hostnameCache.set(host, { ip, at: Date.now() });
    console.log(`[jfo-api] Docker DNS ${host} -> ${ip}`);
  }
  return applyResolvedHostname(raw, ip);
}

export async function resolveUrlEnvForWorkerd(env = process.env, lookup = dns.lookup) {
  const changes = [];
  for (const key of WORKERD_URL_ENV_KEYS) {
    const raw = String(env[key] ?? "").trim();
    if (!raw) continue;
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (!isDockerServiceHostname(url.hostname)) continue;
    try {
      const ip = await lookupIpv4(url.hostname, lookup);
      const next = applyResolvedHostname(raw, ip);
      if (next !== raw) {
        env[key] = next;
        changes.push({ key, from: raw, to: next });
        console.log(`[jfo-api] ${key}: ${raw} -> ${next} (workerd 绕过 Docker DNS)`);
      }
    } catch (e) {
      console.warn(
        `[jfo-api] ${key} 无法解析 ${url.hostname}，沿用 ${raw}:`,
        e?.message ?? e,
      );
    }
  }
  return changes;
}
