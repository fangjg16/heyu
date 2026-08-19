/**
 * workerd/Miniflare 访问 Compose 内网 Hermes（hermes:8642 或 172.x）时常直接炸成
 * `internal error; reference = …`，没有可用的 Node 错误。
 * http-server 把 Worker 的 HERMES_BASE_URL 指到本进程 /__jfo/internal/hermes，
 * 由 Node fetch 每次解析 Docker DNS 再转发。
 */

export const HERMES_NODE_PROXY_PREFIX = "/__jfo/internal/hermes";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

export function isLoopbackAddress(addr) {
  const raw = String(addr || "").trim().toLowerCase();
  if (!raw) return false;
  const a = raw.replace(/^::ffff:/u, "");
  return a === "127.0.0.1" || a === "::1" || a === "localhost";
}

export function hermesProxyWorkerBase(helperBase) {
  const helper = String(helperBase || "")
    .trim()
    .replace(/\/+$/u, "");
  if (!helper) return "";
  return `${helper}${HERMES_NODE_PROXY_PREFIX}`;
}

export function buildHermesUpstreamUrl(upstreamBase, reqUrl) {
  const base = String(upstreamBase || "")
    .trim()
    .replace(/\/+$/u, "");
  if (!base) return "";
  const raw = String(reqUrl || "/");
  const qIndex = raw.indexOf("?");
  const pathOnly = (qIndex >= 0 ? raw.slice(0, qIndex) : raw) || "/";
  const query = qIndex >= 0 ? raw.slice(qIndex) : "";
  let rest = pathOnly;
  if (rest === HERMES_NODE_PROXY_PREFIX || rest.startsWith(`${HERMES_NODE_PROXY_PREFIX}/`)) {
    rest = rest.slice(HERMES_NODE_PROXY_PREFIX.length) || "/";
  }
  if (!rest.startsWith("/")) rest = `/${rest}`;
  return `${base}${rest}${query}`;
}

export function copyRequestHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(nodeHeaders || {})) {
    if (v === undefined) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, String(v));
    }
  }
  return headers;
}

export function shouldSkipResponseHeader(name) {
  const lk = String(name || "").toLowerCase();
  return lk === "transfer-encoding" || lk === "connection" || lk === "content-length";
}

export function formatHermesProxyConnectError(err) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const cause = err && typeof err === "object" && "cause" in err ? err.cause : null;
  const extra =
    cause instanceof Error
      ? cause.message
      : cause && typeof cause === "object" && "code" in cause
        ? String(cause.code)
        : "";
  const combined = extra && !msg.includes(extra) ? `${msg} (${extra})` : msg;
  return `Hermes 上游不可达：${combined || "fetch failed"}`;
}
