import type { ProjectNoticeItem } from "@/lib/project-api";

export const NOTICE_GROUP_WINDOW_MS = 2 * 60 * 60 * 1000;

export function isNoticeActivityKind(kind: string): boolean {
  return kind === "file_upload" || kind === "file_move" || kind === "file_delete";
}

export function isNoticeTodoKind(kind: string): boolean {
  return kind === "kn_draft";
}

export type ParsedFileNotice = {
  actor: string;
  verb: string;
  project: string;
  filename: string;
};

export function parseNoticeFileSummary(summary: string): ParsedFileNotice | null {
  const m = summary
    .trim()
    .match(/^(.+?)\s+(上传|移动|重命名|删除)了「(.+)」的项目资料\s+(.+)$/u);
  if (!m) return null;
  return {
    actor: m[1]!.trim(),
    verb: m[2]!,
    project: m[3]!.trim(),
    filename: m[4]!.trim(),
  };
}

export type ActivityNoticeGroup = {
  ids: string[];
  projectId: string;
  projectName: string;
  actorUserId: string;
  kind: string;
  title: string;
  summary: string;
  href: string | null;
  createdAt: string;
  unread: boolean;
  files: string[];
};

function mergeKey(n: ProjectNoticeItem): string {
  return `${n.actorUserId}\0${n.projectId}\0${n.kind}\0${n.title}`;
}

function isUnread(n: ProjectNoticeItem): boolean {
  return !n.readAt?.trim();
}

export function groupActivityNotices(
  items: ProjectNoticeItem[],
): ActivityNoticeGroup[] {
  const sorted = [...items].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
  const groups: ActivityNoticeGroup[] = [];
  for (const n of sorted) {
    const parsed = parseNoticeFileSummary(n.summary);
    const filename = parsed?.filename ?? "";
    const last = groups[groups.length - 1];
    const t = Date.parse(n.createdAt);
    const lastT = last ? Date.parse(last.createdAt) : Number.NaN;
    const withinWindow =
      Number.isFinite(t) &&
      Number.isFinite(lastT) &&
      Math.abs(lastT - t) <= NOTICE_GROUP_WINDOW_MS;
    if (last && mergeKey(n) === mergeKeyFromGroup(last) && withinWindow) {
      last.ids.push(n.id);
      if (filename && !last.files.includes(filename)) last.files.push(filename);
      if (isUnread(n)) last.unread = true;
      last.summary = formatGroupSummary(last, parsed);
    } else {
      groups.push({
        ids: [n.id],
        projectId: n.projectId,
        projectName: n.projectName,
        actorUserId: n.actorUserId,
        kind: n.kind,
        title: n.title,
        summary: n.summary,
        href: n.href,
        createdAt: n.createdAt,
        unread: isUnread(n),
        files: filename ? [filename] : [],
      });
    }
  }
  return groups;
}

function mergeKeyFromGroup(g: ActivityNoticeGroup): string {
  return `${g.actorUserId}\0${g.projectId}\0${g.kind}\0${g.title}`;
}

function formatGroupSummary(
  group: ActivityNoticeGroup,
  parsed: ParsedFileNotice | null,
): string {
  const files = group.files;
  if (files.length <= 1) return group.summary;
  const actor = parsed?.actor ?? "";
  const verb = parsed?.verb ?? "更新";
  const project = parsed?.project || group.projectName;
  if (!actor) return `${verb}了「${project}」的 ${files.length} 个文件`;
  return `${actor} ${verb}了「${project}」的 ${files.length} 个文件`;
}
