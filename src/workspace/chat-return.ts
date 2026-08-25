const storageKey = (projectId: string) => `hy-chat-return:${projectId}`;

export type FromConversationState = {
  fromConversation?: string;
};

export function isChatReturnPathForProject(
  projectId: string,
  path: string | null | undefined,
): path is string {
  if (!projectId || !path) return false;
  const prefix = `/app/chat/${projectId}/`;
  return path.startsWith(prefix) && path.length > prefix.length;
}

export function fromConversationInState(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as FromConversationState).fromConversation;
  return typeof value === "string" ? value : undefined;
}

export function rememberChatReturnPath(projectId: string, conversationPath: string) {
  if (!isChatReturnPathForProject(projectId, conversationPath)) return;
  try {
    sessionStorage.setItem(storageKey(projectId), conversationPath);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readChatReturnPath(projectId: string): string | null {
  try {
    const stored = sessionStorage.getItem(storageKey(projectId));
    return isChatReturnPathForProject(projectId, stored) ? stored : null;
  } catch {
    return null;
  }
}

export function clearChatReturnPath(projectId: string) {
  try {
    sessionStorage.removeItem(storageKey(projectId));
  } catch {
    /* ignore */
  }
}

export function resolveChatReturnPath(
  projectId: string,
  locationState: unknown,
): string | null {
  const fromState = fromConversationInState(locationState);
  if (isChatReturnPathForProject(projectId, fromState)) return fromState;
  return readChatReturnPath(projectId);
}
