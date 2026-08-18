export function isClerkEnabled(): boolean {
  return Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());
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
