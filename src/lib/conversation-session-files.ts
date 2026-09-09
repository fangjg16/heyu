type SessionFileLike = {
  scope: string;
  conversationId: string | null;
  filename: string;
};

export function filterConversationSessionFiles<T extends SessionFileLike>(
  files: T[],
  conversationId: string,
  messageFilenames?: Iterable<string>,
): T[] {
  const names = messageFilenames
    ? new Set(Array.from(messageFilenames).filter(Boolean))
    : null;
  return files.filter((f) => {
    if (f.scope !== "session") return false;
    if (f.conversationId === conversationId) return true;
    if (names?.size && names.has(f.filename)) return true;
    return false;
  });
}

/**
 * 同名附件收成一条：时间用最新上传，段数用解析最完整的那次。
 * 对话里重复发送同一文件时，列表不再铺三条「1 段 / 17 段 / 18 段」。
 */
export function collapseFilesByFilename<
  T extends {
    filename: string;
    createdAt: string;
    chunkCount: number;
  },
>(files: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const file of files) {
    const key = file.filename.trim().toLowerCase();
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(file);
    else groups.set(key, [file]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const latest = group.reduce((a, b) =>
      a.createdAt >= b.createdAt ? a : b,
    );
    const bestParsed = group.reduce((a, b) => {
      if (b.chunkCount !== a.chunkCount) {
        return b.chunkCount > a.chunkCount ? b : a;
      }
      return a.createdAt >= b.createdAt ? a : b;
    });
    out.push({
      ...bestParsed,
      createdAt: latest.createdAt,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
