import { normalizeUsername } from "./workspace-users-db";

export type ClerkUserPayload = {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  banned?: boolean;
  email_addresses?: Array<{ email_address?: string | null }>;
};

export function primaryClerkEmail(user: ClerkUserPayload): string {
  for (const row of user.email_addresses ?? []) {
    const email = (row.email_address ?? "").trim().toLowerCase();
    if (email) return email;
  }
  return "";
}

export function clerkDisplayName(user: ClerkUserPayload): string {
  const name = [user.first_name, user.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (name) return name;
  const username = (user.username ?? "").trim();
  if (username) return username;
  const email = primaryClerkEmail(user);
  if (email) return email.split("@")[0] || email;
  return user.id;
}

export function clerkUsernameCandidate(user: ClerkUserPayload): string {
  const fromUsername = normalizeUsername(user.username ?? "");
  if (fromUsername) return fromUsername;
  const email = primaryClerkEmail(user);
  if (email.includes("@")) {
    const local = normalizeUsername(email.split("@")[0] ?? "");
    if (local) return local;
    return normalizeUsername(email.replace("@", "-"));
  }
  return normalizeUsername(user.id.replace(/^user_/u, "u-")) || `u-${user.id.slice(-8)}`;
}

export function frontendApiFromPublishableKey(pk: string): string | null {
  const raw = pk.trim();
  const m = /^(?:pk_(?:test|live)_)(.+)$/u.exec(raw);
  if (!m) return null;
  try {
    let b64 = m[1].replace(/-/gu, "+").replace(/_/gu, "/");
    while (b64.length % 4) b64 += "=";
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );
    const host = decoded.split("$")[0]?.trim() ?? "";
    if (!host || !/^[a-z0-9.-]+$/iu.test(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}
