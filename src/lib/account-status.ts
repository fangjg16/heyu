/** 账号生命周期：仅 active / disabled。其它脏值一律视为已停用，避免漏掉「启用」。 */

export type AccountLifecycleStatus = "active" | "disabled";

function bytesToText(data: number[]): string {
  try {
    return String.fromCharCode(...data);
  } catch {
    return "";
  }
}

function rawToStatusText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "boolean") return raw ? "active" : "disabled";
  if (typeof raw === "number") return raw === 0 ? "disabled" : "active";
  if (typeof raw === "string") return raw.trim().toLowerCase();
  if (typeof raw === "object") {
    const rec = raw as {
      type?: string;
      data?: number[];
      status?: unknown;
      isDisabled?: unknown;
    };
    if (Array.isArray(rec.data)) return bytesToText(rec.data).trim().toLowerCase();
    if (rec.isDisabled === true) return "disabled";
    if ("status" in rec) return rawToStatusText(rec.status);
  }
  return String(raw).trim().toLowerCase();
}

export function coerceAccountStatus(raw: unknown): AccountLifecycleStatus {
  const text = rawToStatusText(raw);
  if (
    text === "active" ||
    text === "enabled" ||
    text === "enable" ||
    text === "1" ||
    text === "true"
  ) {
    return "active";
  }
  if (!text) return "active";
  return "disabled";
}

export function isAccountDisabled(raw: unknown): boolean {
  return coerceAccountStatus(raw) === "disabled";
}

export function isUserAccountDisabled(user: {
  status?: unknown;
  isDisabled?: boolean | null;
}): boolean {
  if (user.isDisabled === true) return true;
  return isAccountDisabled(user.status);
}
