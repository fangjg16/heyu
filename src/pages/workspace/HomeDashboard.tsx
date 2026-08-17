import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  ENABLE_LIVE_CHAT,
  fetchCollabItems,
  fetchMyCollabInbox,
  fetchMyOpenQuestions,
  fetchProjectsFromApi,
  collabStatusLabel,
  publishOpenQuestionToIssuer,
  type CollabItem,
  type MyOpenQuestionItem,
} from "@/lib/project-api";
import { extractOpenQuestionTitle, previewCollabQuestion, stripCitationMarkers } from "@/lib/kn-citations";
import { filterMemberProjectsForUser, filterProjectsForUser } from "@/workspace/guest-access";
import {
  getMergedProjects,
  setApiProjects,
  sortProjectsForOverview,
} from "@/workspace/project-registry";
import { loadSessionUserId } from "@/workspace/session";
import { useMyProjectRoles } from "@/hooks/use-my-project-roles";
import { useJoinReviews } from "@/hooks/use-join-reviews";
import {
  getProjectRole,
  getUserById,
  canPublishToIssuer,
  isInvestorRole,
  isIssuerRole,
  projectEntryPath,
} from "@/workspace/workspace-users";
import type { ProjectPhase, WorkspaceProject } from "@/workspace/projects";

/** 原型硬编码色，总览页与 HTML 原型逐项对齐 */
const C = {
  ink: "#1F2423",
  muted: "#59625F",
  wine: "#A06358",
  wineDeep: "#922233",
  paper: "rgba(255,252,248,0.82)",
  line: "rgba(78,66,57,0.1)",
  amber: "#D59A2F",
  green: "#5E9B75",
  greenDeep: "#3F6F63",
} as const;

function greetingForHour(h: number): string {
  if (h < 5) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/** 原型格式：`2025 年 6 月 18 日 · 周三` */
function formatDateCn(d: Date): string {
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`;
}

function shortDisplayName(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return "";
  const spaced = raw.replace(/([a-z])([A-Z])/g, "$1 $2");
  const first = spaced.split(/[\s·・]+/)[0]?.trim();
  return first || raw;
}

function projectMark(name: string): string {
  const t = name.trim();
  if (!t) return "项";
  if (/^[A-Za-z]/.test(t)) return t.slice(0, 3).toUpperCase();
  return t.slice(0, 2);
}

function judgmentFromPhase(phase: ProjectPhase): {
  label: string;
  bg: string;
  fg: string;
} {
  if (phase.startsWith("Paused")) {
    return { label: "暂缓", bg: "rgba(78,66,57,0.08)", fg: C.muted };
  }
  if (phase.startsWith("Completed")) {
    return {
      label: "继续推进",
      bg: "rgba(94,155,117,0.16)",
      fg: C.greenDeep,
    };
  }
  if (phase.startsWith("Cancelled")) {
    return { label: "已取消", bg: "rgba(78,66,57,0.08)", fg: C.muted };
  }
  return {
    label: "研究中",
    bg: "#FBF1E2",
    fg: "#B07d1f",
  };
}

function stageLabel(p: WorkspaceProject): string {
  const cn = p.phase.match(/（(.+?)）/)?.[1];
  return cn ? `研究中 · ${cn}` : p.phase || "研究中";
}

function iconTone(index: number): { bg: string; fg: string } {
  const tones = [
    { bg: "#EFE7E6", fg: C.wine },
    { bg: "rgba(94,155,117,0.14)", fg: C.greenDeep },
    { bg: "rgba(213,154,47,0.14)", fg: C.amber },
  ];
  return tones[index % tones.length]!;
}

function priorityColor(priority: MyOpenQuestionItem["priority"]): string {
  if (priority === "P1") return C.wine;
  if (priority === "P2") return C.amber;
  return C.green;
}

const COLLAB_PUBLISH_DRAFT_KEY = (projectId: string) =>
  `hy-collab-publish-draft:${projectId}`;

export default function HomeDashboard() {
  const userId = loadSessionUserId();
  const user = getUserById(userId);
  const rolesVersion = useMyProjectRoles(userId);
  const { pendingCount, requests: joinReviews } = useJoinReviews();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [openQuestions, setOpenQuestions] = useState<MyOpenQuestionItem[]>([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState<string | null>(null);
  const [collabInbox, setCollabInbox] = useState<
    (CollabItem & { projectName?: string })[]
  >([]);
  const [publishedByProject, setPublishedByProject] = useState<
    Record<string, CollabItem[]>
  >({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        if (ENABLE_LIVE_CHAT) {
          const rows = await fetchProjectsFromApi(undefined, {
            userId: userId ?? undefined,
          });
          if (!cancelled) setApiProjects(rows);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          const merged = filterProjectsForUser(
            userId ?? "",
            sortProjectsForOverview(getMergedProjects())
          );
          setProjects(merged);
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ENABLE_LIVE_CHAT || !userId) {
      setOpenQuestions([]);
      setTodosError(null);
      setTodosLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setTodosLoading(true);
      setTodosError(null);
      try {
        const data = await fetchMyOpenQuestions();
        if (cancelled) return;
        setOpenQuestions(data.items);
      } catch (e) {
        if (cancelled) return;
        setOpenQuestions([]);
        setTodosError(e instanceof Error ? e.message : "待办加载失败");
      } finally {
        if (!cancelled) setTodosLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ENABLE_LIVE_CHAT || !userId) {
      setCollabInbox([]);
      return;
    }
    let cancelled = false;
    void fetchMyCollabInbox()
      .then((items) => {
        if (!cancelled) setCollabInbox(items);
      })
      .catch(() => {
        if (!cancelled) setCollabInbox([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!ENABLE_LIVE_CHAT || !userId || projects.length === 0) {
      setPublishedByProject({});
      return;
    }
    const investorIds = filterMemberProjectsForUser(userId, projects)
      .filter((p) =>
        isInvestorRole(getProjectRole(userId, p.id, p.createdBy)),
      )
      .map((p) => p.id);
    if (investorIds.length === 0) {
      setPublishedByProject({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      investorIds.map((id) =>
        fetchCollabItems(id)
          .then((items) => [id, items] as const)
          .catch(() => [id, [] as CollabItem[]] as const),
      ),
    ).then((rows) => {
      if (!cancelled) setPublishedByProject(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, projects, rolesVersion]);

  const now = useMemo(() => new Date(), []);
  const shortName = shortDisplayName(user?.displayName);
  const greeting = shortName
    ? `${greetingForHour(now.getHours())}，${shortName}`
    : greetingForHour(now.getHours());

  const memberProjects = useMemo(
    () => filterMemberProjectsForUser(userId ?? "", projects),
    [userId, projects, rolesVersion],
  );
  const shortList = memberProjects.slice(0, 3);
  const hasInvestorProject = memberProjects.some((p) =>
    isInvestorRole(getProjectRole(userId ?? "", p.id, p.createdBy)),
  );
  const hasIssuerProject = memberProjects.some((p) =>
    isIssuerRole(getProjectRole(userId ?? "", p.id, p.createdBy)),
  );

  const todos = useMemo(() => {
    return openQuestions.map((item) => {
      const { title, detail } = extractOpenQuestionTitle(item.text);
      const published = (publishedByProject[item.projectId] ?? []).find(
        (it) =>
          it.sourceQuestionText === item.text ||
          it.title === item.text.slice(0, 48),
      );
      return {
        id: item.id,
        text: item.text,
        title: title || stripCitationMarkers(item.text),
        detail,
        meta: item.projectName,
        due: published
          ? `已发布 · ${collabStatusLabel(published.status)}`
          : `${item.priorityLabel} · 未发布给项目协作方`,
        color: priorityColor(item.priority),
        to: `/app/projects/${encodeURIComponent(item.projectId)}/collab`,
        listMeta: published
          ? `${item.projectName} · 已发布给项目协作方`
          : `${item.projectName} · 内部缺口，项目协作方尚未看到`,
        listDue: published ? collabStatusLabel(published.status) : "未发布",
        published: Boolean(published),
        projectId: item.projectId,
        priority: item.priority,
      };
    });
  }, [openQuestions, publishedByProject]);

  const collabFocus = collabInbox[0]
    ? (() => {
        const preview = previewCollabQuestion(collabInbox[0]);
        return {
        id: `collab-${collabInbox[0].id}`,
        text: collabInbox[0].title,
        title: preview.title,
        detail: preview.detail,
        meta: collabInbox[0].projectName ?? "项目协作方协作",
        due: collabInbox[0].dueAt
          ? `截止 ${collabInbox[0].dueAt.slice(0, 10)}`
          : "待你回复",
        color: C.wine,
        to: `/app/collab/${collabInbox[0].projectId}/items/${collabInbox[0].id}`,
        listMeta: collabInbox[0].projectName ?? "",
        listDue: collabInbox[0].dueAt ? collabInbox[0].dueAt.slice(0, 10) : "",
        published: true,
        projectId: collabInbox[0].projectId,
        priority: collabInbox[0].priority,
        };
      })()
    : null;
  const focusTodo = todos[0] ?? collabFocus;
  const displayTodos = todos.slice(0, 3);
  const showInvestorTodos = hasInvestorProject;
  const showIssuerTodos = hasIssuerProject;
  const unpublishedCount = todos.filter((t) => !t.published).length;

  const canPublishForProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!userId || !project) return false;
    return canPublishToIssuer(getProjectRole(userId, project.id, project.createdBy));
  };
  const canSendUnpublished = todos.some(
    (t) => !t.published && canPublishForProject(t.projectId),
  );

  const refreshPublished = async (projectId: string) => {
    const items = await fetchCollabItems(projectId).catch(() => [] as CollabItem[]);
    setPublishedByProject((prev) => ({ ...prev, [projectId]: items }));
  };

  const sendToIssuer = async (item: {
    id: string;
    projectId: string;
    text: string;
    title: string;
    published?: boolean;
    priority?: MyOpenQuestionItem["priority"];
  }) => {
    if (item.published || sendingId) return;
    if (!canPublishForProject(item.projectId)) {
      setSendError("仅 Admin / Core 可发给项目协作方");
      return;
    }
    setSendingId(item.id);
    setSendError(null);
    try {
      await publishOpenQuestionToIssuer(item.projectId, {
        text: item.text,
        title: item.title,
        priority: item.priority,
      });
      await refreshPublished(item.projectId);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSendingId(null);
    }
  };

  const sendAllUnpublished = async () => {
    const pending = todos.filter(
      (t) => !t.published && canPublishForProject(t.projectId),
    );
    if (pending.length === 0 || sendingId) return;
    setSendingId("all");
    setSendError(null);
    try {
      for (const item of pending) {
        await publishOpenQuestionToIssuer(item.projectId, {
          text: item.text,
          title: item.title,
          priority: item.priority,
        });
      }
      const ids = [...new Set(pending.map((t) => t.projectId))];
      await Promise.all(ids.map((id) => refreshPublished(id)));
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSendingId(null);
    }
  };

  const rememberPublishDraft = (item: {
    projectId: string;
    text: string;
    title: string;
    published?: boolean;
    priority?: MyOpenQuestionItem["priority"];
  }) => {
    if (item.published) return;
    try {
      sessionStorage.setItem(
        COLLAB_PUBLISH_DRAFT_KEY(item.projectId),
        JSON.stringify({
          sourceText: item.text,
          title: item.title.slice(0, 48),
          priority: item.priority ?? "P2",
        }),
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <WorkspaceShell>
      <div
        className="mx-auto w-full"
        style={{
          maxWidth: 1180,
          padding: "56px 56px 80px",
          color: C.ink,
          fontSize: 15.5,
          lineHeight: 1.6,
        }}
      >
        {/* 日期 */}
        <div
          style={{
            fontSize: 14.5,
            color: C.muted,
            letterSpacing: "0.5px",
          }}
        >
          {formatDateCn(now)}
        </div>

        {/* 问候 */}
        <h1
          className="font-display"
          style={{
            marginTop: 10,
            fontSize: 40,
            fontWeight: 600,
            color: C.ink,
            lineHeight: 1.25,
            letterSpacing: 0,
          }}
        >
          {greeting}
        </h1>

        {pendingCount > 0 ? (
          <Link
            to="/app/notifications"
            style={{
              marginTop: 20,
              display: "block",
              borderRadius: 16,
              border: "1px solid rgba(160,99,88,0.28)",
              background: "rgba(160,99,88,0.08)",
              padding: "14px 18px",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: C.wine }}>
              {pendingCount} 条加入申请待审批
            </div>
            <div style={{ marginTop: 4, fontSize: 13.5, color: C.muted }}>
              {joinReviews[0]?.applicantDisplayName ?? "有人"}申请加入
              {joinReviews[0]?.projectName
                ? `「${joinReviews[0].projectName}」`
                : "项目"}
              {pendingCount > 1 ? " 等" : ""}。点此处理。
            </div>
          </Link>
        ) : null}

        {/* 焦点卡：最紧急待确认问题（对齐原型 homeFocus） */}
        {focusTodo ? (
          <div
            className="block transition-shadow"
            style={{
              marginTop: 36,
              background: `linear-gradient(120deg, ${C.wine} 0%, ${C.wineDeep} 100%)`,
              borderRadius: 24,
              padding: "36px 40px",
              boxShadow: "0 18px 44px rgba(139,31,36,0.26)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.62)",
                letterSpacing: "1.5px",
              }}
            >
              {focusTodo.to.startsWith("/app/collab/") &&
              hasIssuerProject &&
              !hasInvestorProject
                ? "今天最重要的协作事项"
                : "今天最重要的一件事"}
            </div>
            <div
              className="font-display"
              style={{
                marginTop: 10,
                fontSize: 29,
                fontWeight: 600,
                color: "#fff",
                lineHeight: 1.35,
              }}
            >
              {focusTodo.title}
            </div>
            {focusTodo.detail ? (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  color: "rgba(255,255,255,0.68)",
                  lineHeight: 1.55,
                  maxWidth: 720,
                }}
              >
                {focusTodo.detail}
              </div>
            ) : null}
            <div
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "rgba(255,255,255,0.48)",
                letterSpacing: "0.2px",
              }}
            >
              {focusTodo.meta} · {focusTodo.due}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                marginTop: 28,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {focusTodo.to.startsWith("/app/collab/") || focusTodo.published ? (
                <Link
                  to={focusTodo.to}
                  style={{
                    height: 42,
                    padding: "0 20px",
                    borderRadius: 12,
                    background: "#fff",
                    color: C.wine,
                    fontSize: 14.5,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  {focusTodo.to.startsWith("/app/collab/")
                    ? "查看事项 →"
                    : "查看进度 →"}
                </Link>
              ) : canPublishForProject(focusTodo.projectId) ? (
                <>
                  <Link
                    to={focusTodo.to}
                    onClick={() => rememberPublishDraft(focusTodo)}
                    style={{
                      height: 42,
                      padding: "0 16px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.55)",
                      background: "rgba(255,255,255,0.12)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    改措辞
                  </Link>
                  <button
                    type="button"
                    disabled={Boolean(sendingId)}
                    onClick={() => void sendToIssuer(focusTodo)}
                    style={{
                      height: 42,
                      padding: "0 20px",
                      borderRadius: 12,
                      background: "#fff",
                      color: C.wine,
                      fontSize: 14.5,
                      fontWeight: 600,
                      border: 0,
                      cursor: sendingId ? "wait" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sendingId === focusTodo.id ? "发送中…" : "发给项目协作方"}
                  </button>
                </>
              ) : (
                <Link
                  to={focusTodo.to}
                  style={{
                    height: 42,
                    padding: "0 20px",
                    borderRadius: 12,
                    background: "#fff",
                    color: C.wine,
                    fontSize: 14.5,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  查看进度 →
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 36,
              borderRadius: 24,
              border: `1px solid ${C.line}`,
              background: C.paper,
              padding: "36px 40px",
            }}
          >
            <div
              className="font-display"
              style={{ fontSize: 24, fontWeight: 600, color: C.ink }}
            >
              {todosLoading
                ? "正在加载待办…"
                : loading
                  ? "欢迎使用合域"
                  : hasIssuerProject && !hasInvestorProject
                    ? "暂无待你处理的事项"
                    : memberProjects.length > 0
                    ? "暂无紧急待办"
                    : "欢迎使用合域"}
            </div>
            <p
              style={{
                marginTop: 12,
                fontSize: 15.5,
                lineHeight: 1.7,
                color: C.muted,
              }}
            >
              {todosLoading
                ? "正在汇总各项目待确认问题…"
                : loading
                  ? "正在加载项目…"
                  : hasIssuerProject && !hasInvestorProject
                    ? "投资团队发布事项后，会显示在这里。内部研究缺口不会自动同步给你。"
                    : memberProjects.length > 0
                    ? "知识网络里的缺口默认按原文一键发给项目协作方即可；有判断性措辞时再点「改措辞」。"
                    : "暂无已加入项目。可去项目广场浏览全开放协作，或新建项目。"}
            </p>
            <Link
              to="/app/projects"
              style={{
                marginTop: 22,
                display: "inline-flex",
                height: 44,
                alignItems: "center",
                padding: "0 20px",
                borderRadius: 12,
                background: C.wine,
                color: "#fff",
                fontSize: 14.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              前往项目库
            </Link>
          </div>
        )}

        {showInvestorTodos ? (
        <>
        {/* 我的待办 */}
        <div
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div
            className="font-display"
            style={{ fontSize: 21, fontWeight: 600, color: C.ink }}
          >
            内部待确认问题
          </div>
          <span style={{ fontSize: 14, color: C.muted }}>
            {todosLoading
              ? "…"
              : displayTodos.length > 0
                ? `${displayTodos.length} 项 · ${unpublishedCount} 条未发`
                : "—"}
          </span>
        </div>
        <p
          style={{
            marginTop: 8,
            fontSize: 13.5,
            color: C.muted,
            lineHeight: 1.6,
          }}
        >
          {canSendUnpublished
            ? "默认按原文发给项目协作方，发布后冻结。含投资判断的条目请先「改措辞」。"
            : "知识网络章节中的待确认问题会汇总在此。"}
        </p>
        {canSendUnpublished ? (
          <button
            type="button"
            disabled={Boolean(sendingId)}
            onClick={() => void sendAllUnpublished()}
            style={{
              marginTop: 12,
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
              border: `1px solid ${C.line}`,
              background: C.paper,
              color: C.wine,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: sendingId ? "wait" : "pointer",
            }}
          >
            {sendingId === "all"
              ? "发送中…"
              : `全部按原文发给项目协作方（${unpublishedCount}）`}
          </button>
        ) : null}
        {sendError ? (
          <p style={{ marginTop: 8, fontSize: 13.5, color: C.wine }}>{sendError}</p>
        ) : null}
        <div style={{ marginTop: 14 }}>
          {todosLoading ? (
            <p
              style={{
                padding: "28px 6px",
                fontSize: 15,
                color: C.muted,
              }}
            >
              加载待确认问题…
            </p>
          ) : todosError ? (
            <p
              style={{
                padding: "28px 6px",
                fontSize: 15,
                color: C.wine,
              }}
            >
              {todosError}
            </p>
          ) : displayTodos.length === 0 ? (
            <p
              style={{
                padding: "28px 6px",
                fontSize: 15,
                color: C.muted,
              }}
            >
              暂无内部待确认问题。生成知识网络该章节后会汇总在此。
            </p>
          ) : (
            displayTodos.map((t) => (
              <div
                key={t.id}
                className="transition-colors"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "20px 6px",
                  borderBottom: `1px solid ${C.line}`,
                  color: "inherit",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: t.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16.5,
                      fontWeight: 600,
                      color: C.ink,
                      lineHeight: 1.45,
                    }}
                  >
                    {t.title}
                  </div>
                  {t.detail ? (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13.5,
                        color: C.muted,
                        lineHeight: 1.55,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {t.detail}
                    </div>
                  ) : null}
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13.5,
                      color: C.muted,
                    }}
                  >
                    {t.listMeta}
                  </div>
                </div>
                {t.published ? (
                  <Link
                    to={t.to}
                    style={{
                      fontSize: 13.5,
                      color: C.wine,
                      textDecoration: "none",
                      flexShrink: 0,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.listDue} →
                  </Link>
                ) : canPublishForProject(t.projectId) ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexShrink: 0,
                    }}
                  >
                    <Link
                      to={t.to}
                      onClick={() => rememberPublishDraft(t)}
                      style={{
                        height: 34,
                        padding: "0 12px",
                        borderRadius: 9,
                        border: `1px solid ${C.wine}`,
                        background: "transparent",
                        color: C.wine,
                        fontSize: 13,
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      改措辞
                    </Link>
                    <button
                      type="button"
                      disabled={Boolean(sendingId)}
                      onClick={() => void sendToIssuer(t)}
                      style={{
                        height: 34,
                        padding: "0 12px",
                        borderRadius: 9,
                        border: 0,
                        background: C.wine,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: sendingId ? "wait" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sendingId === t.id ? "发送中…" : "发给项目协作方"}
                    </button>
                  </div>
                ) : (
                  <Link
                    to={t.to}
                    style={{
                      fontSize: 13.5,
                      color: C.wine,
                      textDecoration: "none",
                      flexShrink: 0,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    查看 →
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
        </>
        ) : null}

        {showIssuerTodos ? (
          <>
            <div
              style={{
                marginTop: 44,
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div
                className="font-display"
                style={{ fontSize: 21, fontWeight: 600, color: C.ink }}
              >
                项目协作方待办
              </div>
              <span style={{ fontSize: 14, color: C.muted }}>
                {collabInbox.length} 项
              </span>
            </div>
            <p
              style={{
                marginTop: 8,
                fontSize: 13.5,
                color: C.muted,
                lineHeight: 1.6,
              }}
            >
              只显示投资团队已经发布给你的事项，不会自动带出他们内部的研究缺口。
            </p>
            <div style={{ marginTop: 14 }}>
              {collabInbox.length === 0 ? (
                <p
                  style={{
                    padding: "28px 6px",
                    fontSize: 15,
                    color: C.muted,
                  }}
                >
                  投资团队尚未向你发布事项。你仍可在项目「源文件」中上传补充资料。
                </p>
              ) : (
                collabInbox.slice(0, 5).map((it) => {
                  const preview = previewCollabQuestion(it);
                  const isFocus = collabInbox[0]?.id === it.id;
                  return (
                <Link
                  key={it.id}
                  to={`/app/collab/${it.projectId}/items/${it.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    padding: "16px 6px",
                    borderBottom: `1px solid ${C.line}`,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 15.5,
                        fontWeight: 600,
                        color: C.ink,
                        lineHeight: 1.4,
                      }}
                    >
                      {preview.title}
                    </div>
                    {!isFocus && preview.detail ? (
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 12.5,
                        color: C.muted,
                        lineHeight: 1.45,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {preview.detail}
                    </div>
                    ) : null}
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 12,
                        color: "#969E9A",
                      }}
                    >
                      {it.projectName ?? ""} · {collabStatusLabel(it.status, "issuer")}
                      {it.dueAt ? ` · 截止 ${it.dueAt.slice(0, 10)}` : ""}
                    </div>
                  </div>
                  <span style={{ color: C.wine, fontSize: 14 }}>→</span>
                </Link>
              );
                })
              )}
            </div>
          </>
        ) : null}

        {shortList.length > 0 ? (
          <>
        {/* 进行中的项目：仅已加入，不含广场访客可见的空壳 */}
        <div
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div
            className="font-display"
            style={{ fontSize: 21, fontWeight: 600, color: C.ink }}
          >
            进行中的项目
          </div>
          <Link
            to="/app/projects"
            style={{
              fontSize: 14,
              color: C.wine,
              textDecoration: "none",
            }}
          >
            查看全部项目 →
          </Link>
        </div>
        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {shortList.map((p, i) => {
            const pill = judgmentFromPhase(p.phase);
            const tone = iconTone(i);
            return (
              <Link
                key={p.id}
                to={projectEntryPath(
                  p.id,
                  getProjectRole(userId ?? "", p.id, p.createdBy),
                )}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  background: C.paper,
                  border: `1px solid ${C.line}`,
                  borderRadius: 18,
                  padding: "20px 22px",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(160,99,88,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.line;
                }}
              >
                <div
                  className="font-display"
                  style={{
                    width: 50,
                    height: 50,
                    flexShrink: 0,
                    borderRadius: 14,
                    background: tone.bg,
                    color: tone.fg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {projectMark(p.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: C.ink,
                      }}
                    >
                      {p.name}
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "3px 10px",
                        borderRadius: 20,
                        background: pill.bg,
                        color: pill.fg,
                      }}
                    >
                      {pill.label}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13.5,
                      color: C.muted,
                    }}
                  >
                    当前 {stageLabel(p)}
                  </div>
                </div>
                <span
                  style={{
                    color: C.wine,
                    flexShrink: 0,
                    fontSize: 16,
                  }}
                >
                  →
                </span>
              </Link>
            );
          })}
        </div>
          </>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
