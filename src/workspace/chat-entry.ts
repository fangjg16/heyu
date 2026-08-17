import { loadChatStateForUser } from "@/workspace/chat-persistence";
import {
  conversationRoutePath,
  inferProjectIdFromConversationId,
  pickConversationIdForProject,
} from "@/workspace/chat-conversation-id";
import {
  getMergedProjects,
  getProjectById,
  sortProjectsForOverview,
} from "@/workspace/project-registry";
import { filterMemberProjectsForUser } from "@/workspace/guest-access";
import { loadLastChatProjectId } from "@/workspace/session";
import { getProjectRole } from "@/workspace/workspace-users";

function pathForConversation(projectId: string, conversationId: string): string {
  return conversationRoutePath(projectId, conversationId);
}

function memberProjectsForUser(userId: string | null) {
  return sortProjectsForOverview(
    filterMemberProjectsForUser(userId ?? "", getMergedProjects()),
  );
}

function isMemberOfProject(userId: string | null, projectId: string): boolean {
  if (!userId) return false;
  const project = getProjectById(projectId);
  return getProjectRole(userId, projectId, project?.createdBy) !== "guest";
}

function pickFirstProjectChatPath(userId: string | null): string | null {
  const first = memberProjectsForUser(userId)[0];
  return first ? conversationRoutePath(first.id, `${first.id}-main`) : null;
}

function resolveFromLastChatOrSeed(userId: string | null): string | null {
  const lastChat = loadLastChatProjectId();
  if (lastChat && isMemberOfProject(userId, lastChat)) {
    return conversationRoutePath(lastChat, `${lastChat}-main`);
  }
  return pickFirstProjectChatPath(userId);
}

function resolveFromChatState(
  userId: string | null,
  convs: Awaited<ReturnType<typeof loadChatStateForUser>>,
): string | null {
  if (!convs) return null;

  const msgs = convs.messagesByConversation;
  const recentWithMessages = [...convs.conversations]
    .filter((c) => {
      const list = msgs[c.id];
      return Array.isArray(list) && list.length > 0 && isMemberOfProject(userId, c.projectId);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (recentWithMessages[0]) {
    const c = recentWithMessages[0];
    if (getProjectById(c.projectId) || c.projectId.startsWith("proj-")) {
      return pathForConversation(c.projectId, c.id);
    }
  }

  let bestProjectId: string | null = null;
  let bestCount = 0;
  for (const [conversationId, list] of Object.entries(msgs)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const pid = inferProjectIdFromConversationId(conversationId);
    if (!pid || !isMemberOfProject(userId, pid)) continue;
    if (list.length > bestCount) {
      bestCount = list.length;
      bestProjectId = pid;
    }
  }
  if (bestProjectId) {
    const picked = pickConversationIdForProject(bestProjectId, msgs);
    return conversationRoutePath(bestProjectId, picked);
  }
  return null;
}

/** 同步兜底：上次打开的已加入项目或列表中第一个成员项目；无项目时返回 null */
export function resolveChatEntryPath(userId: string | null): string | null {
  return resolveFromLastChatOrSeed(userId);
}

/** 顶部「对话中心」：优先云端最近会话，否则上次已加入项目；无项目时返回 null（由入口页展示空态） */
export async function resolveChatEntryPathAsync(
  userId: string | null,
): Promise<string | null> {
  if (userId) {
    const state = await loadChatStateForUser(userId);
    const fromCloud = resolveFromChatState(userId, state);
    if (fromCloud) return fromCloud;
  }
  return resolveFromLastChatOrSeed(userId);
}
