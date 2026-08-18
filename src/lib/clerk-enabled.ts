const FALLBACK_PUBLISHABLE_KEY =
  "pk_test_a2luZC1maXNoLTU2NTMuY2xlcmsuYWNjb3VudHMuZGV2JA";

export function clerkPublishableKey(): string {
  return (
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ||
    FALLBACK_PUBLISHABLE_KEY
  );
}

export function isClerkEnabled(): boolean {
  return Boolean(clerkPublishableKey());
}

export async function signOutClerkBrowser(): Promise<void> {
  const clerk = (
    window as unknown as {
      Clerk?: { signOut?: () => Promise<unknown> };
    }
  ).Clerk;
  if (!clerk?.signOut) return;
  try {
    await clerk.signOut();
  } catch {
    /* ignore */
  }
}
