/** Sidebar + bootstrap helpers for conversation list (no React). */

export type SidebarConversationMeta = {
  id: string;
  projectId: string;
  title?: string;
  preview?: string;
  updatedAt?: string;
  files?: string[];
  variant?: "blank" | "named";
};

export function conversationHasLoadedMessages(
  conversationId: string,
  messagesByConversation: Record<string, readonly unknown[] | undefined>,
): boolean {
  const msgs = messagesByConversation[conversationId];
  return Array.isArray(msgs) && msgs.length > 0;
}

/**
 * Live sidebar visibility.
 *
 * Conversation metas from D1 must stay visible even when this tab has not
 * hydrated their messages yet. `messages.length === 0` only means "not loaded
 * here", not "this thread does not exist".
 *
 * The current empty new chat (追问 / 新对话) is always kept.
 */
export function pruneEmptyLiveConversations<T extends SidebarConversationMeta>(
  convs: T[],
  messagesByConversation: Record<string, readonly unknown[] | undefined>,
  currentConversationId?: string,
): T[] {
  return convs.filter((c) => {
    if (!c.id || !c.projectId) return false;
    if (currentConversationId && c.id === currentConversationId) return true;
    if (c.id === `${c.projectId}-main`) return true;
    if (c.variant === "blank" || c.variant === "named") return true;
    if (conversationHasLoadedMessages(c.id, messagesByConversation)) return true;
    // Persisted rows typically have variant unset after the first user turn.
    return true;
  });
}

export function conversationSidebarRows<T extends SidebarConversationMeta>(
  convs: T[],
  messagesByConversation: Record<string, readonly unknown[] | undefined>,
  isLiveAiMode: boolean,
  currentConversationId?: string,
): T[] {
  const list = isLiveAiMode
    ? pruneEmptyLiveConversations(convs, messagesByConversation, currentConversationId)
    : convs;
  return [...list].sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
}

/** Functional prepend: never replace the list with only the new row. */
export function prependConversation<T extends { id: string }>(
  prev: T[],
  incoming: T,
): T[] {
  return [incoming, ...prev.filter((c) => c.id !== incoming.id)];
}

/**
 * Merge a bootstrap payload into whatever this tab already has.
 * Incoming wins on id overlap; local-only rows (e.g. a 追问 blank) are kept.
 * An empty incoming payload must not wipe a non-empty local list.
 */
export function mergeBootstrapConversationList<T extends { id: string }>(
  local: T[],
  incoming: T[],
): T[] {
  if (incoming.length === 0 && local.length > 0) return local;
  if (local.length === 0) return incoming;
  const incomingIds = new Set(incoming.map((c) => c.id));
  const localOnly = local.filter((c) => !incomingIds.has(c.id));
  if (localOnly.length === 0) return incoming;
  return [...localOnly, ...incoming];
}

function messageCount(
  messagesByConversation: Record<string, readonly unknown[] | undefined>,
): number {
  return Object.values(messagesByConversation).reduce(
    (n, arr) => n + (arr?.length ?? 0),
    0,
  );
}

/**
 * Merge hydrated messages with a bootstrap payload.
 * Empty incoming must not wipe messages this tab already loaded.
 */
export function mergeBootstrapMessages<T>(
  local: Record<string, T[]>,
  incoming: Record<string, T[]>,
): Record<string, T[]> {
  if (messageCount(incoming) === 0 && messageCount(local) > 0) return local;
  return { ...local, ...incoming };
}

export function conversationHydrateCount(
  conversations: readonly { id: string }[],
  messagesByConversation: Record<string, readonly unknown[] | undefined>,
): number {
  const ids = new Set<string>();
  for (const c of conversations) {
    if (c.id) ids.add(c.id);
  }
  for (const id of Object.keys(messagesByConversation)) {
    if (id) ids.add(id);
  }
  return ids.size;
}

/**
 * True when local list looks truncated vs the last successful hydrate.
 * Used to skip auto-PUT so a half-loaded tab cannot overwrite D1.
 */
export function isTruncatedConversationList(
  localCount: number,
  lastLoadedCount: number,
): boolean {
  if (lastLoadedCount <= 1) return false;
  if (localCount >= lastLoadedCount) return false;
  return localCount <= Math.max(1, Math.floor(lastLoadedCount / 2));
}
