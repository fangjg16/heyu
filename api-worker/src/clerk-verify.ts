import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTPayload } from "jose";
import {
  clerkDisplayName,
  clerkUsernameCandidate,
  frontendApiFromPublishableKey,
  primaryClerkEmail,
  type ClerkUserPayload,
} from "./clerk-profile";

export type ClerkEnv = {
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWT_ISSUER?: string;
  CLERK_JWKS_URL?: string;
  CLERK_JWT_KEY?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
  ALLOWED_ORIGIN?: string;
};

const JWKS_CACHE = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function clerkConfigured(env: ClerkEnv): boolean {
  return Boolean((env.CLERK_SECRET_KEY ?? "").trim());
}

function normalizePem(raw: string): string {
  return raw.trim().replace(/\\n/gu, "\n");
}

function authorizedParties(env: ClerkEnv): string[] {
  const fromEnv = (env.CLERK_AUTHORIZED_PARTIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = (env.ALLOWED_ORIGIN ?? "").trim();
  const extra = origin ? [origin] : [];
  return [...new Set([...fromEnv, ...extra, "http://localhost:5173", "http://127.0.0.1:5173"])];
}

function issuerFromEnv(env: ClerkEnv): string | null {
  const explicit = (env.CLERK_JWT_ISSUER ?? "").trim().replace(/\/+$/u, "");
  if (explicit) return explicit;
  const fromPk = frontendApiFromPublishableKey(env.CLERK_PUBLISHABLE_KEY ?? "");
  return fromPk;
}

function jwksUrlFromEnv(env: ClerkEnv): string | null {
  const explicit = (env.CLERK_JWKS_URL ?? "").trim();
  if (explicit) return explicit;
  const issuer = issuerFromEnv(env);
  if (issuer) return `${issuer}/.well-known/jwks.json`;
  return null;
}

export async function verifyClerkSessionToken(
  token: string,
  env: ClerkEnv,
): Promise<JWTPayload | null> {
  const raw = token.trim();
  if (!raw || raw.split(".").length !== 3) return null;
  const pem = (env.CLERK_JWT_KEY ?? "").trim();
  const issuer = issuerFromEnv(env) ?? undefined;
  try {
    const result = pem
      ? await jwtVerify(raw, await importSPKI(normalizePem(pem), "RS256"), {
          issuer,
          clockTolerance: 5,
        })
      : await verifyWithJwks(raw, env, issuer);
    const azp = typeof result.payload.azp === "string" ? result.payload.azp : "";
    if (azp) {
      const allowed = authorizedParties(env);
      if (allowed.length > 0 && !allowed.includes(azp)) return null;
    }
    if (!result.payload.sub) return null;
    return result.payload;
  } catch {
    return null;
  }
}

async function verifyWithJwks(
  token: string,
  env: ClerkEnv,
  issuer: string | undefined,
) {
  const url = jwksUrlFromEnv(env);
  if (!url) throw new Error("missing Clerk JWKS");
  let jwks = JWKS_CACHE.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    JWKS_CACHE.set(url, jwks);
  }
  return jwtVerify(token, jwks, { issuer, clockTolerance: 5 });
}

export async function fetchClerkUser(
  env: ClerkEnv,
  clerkUserId: string,
): Promise<ClerkUserPayload | null> {
  const secret = (env.CLERK_SECRET_KEY ?? "").trim();
  if (!secret || !clerkUserId.trim()) return null;
  const res = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId.trim())}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as ClerkUserPayload;
  if (!data?.id) return null;
  return data;
}

export function profileFromClerkUser(user: ClerkUserPayload): {
  clerkUserId: string;
  username: string;
  displayName: string;
  email: string;
  banned: boolean;
} {
  return {
    clerkUserId: user.id,
    username: clerkUsernameCandidate(user),
    displayName: clerkDisplayName(user),
    email: primaryClerkEmail(user),
    banned: Boolean(user.banned),
  };
}
