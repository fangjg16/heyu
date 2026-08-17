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
  type CollabItem,
  type MyOpenQuestionItem,
} from "@/lib/project-api";
import { extractOpenQuestionTitle } from "@/lib/kn-citations";
import { filterProjectsForUser } from "@/workspace/guest-access";
import {
  getMergedProjects,
  setApiProjects,
  sortProjectsForOverview,
} from "@/workspace/project-registry";
import { loadSessionUserId } from "@/workspace/session";
import { useMyProjectRoles } from "@/hooks/use-my-project-roles";
import {
  getProjectRole,
  getUserById,
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
  useMyProjectRoles(userId);
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
    const investorIds = projects
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
  }, [userId, projects]);

  const now = useMemo(() => new Date(), []);
  const shortName = shortDisplayName(user?.displayName);
  const greeting = shortName
    ? `${greetingForHour(now.getHours())}，${shortName}`
    : greetingForHour(now.getHours());

  const shortList = projects.slice(0, 3);
  const hasInvestorProject = projects.some((p) =>
    isInvestorRole(getProjectRole(userId ?? "", p.id, p.createdBy)),
  );
  const hasIssuerProject = projects.some((p) =>
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
        title: title || item.text,
        detail,
        meta: item.projectName,
        due: published
          ? `已发布 · ${collabStatusLabel(published.status)}`
          : `${item.priorityLabel} · 未发布给项目方`,
        color: priorityColor(item.priority),
        to: `/app/projects/${encodeURIComponent(item.projectId)}/collab`,
        listMeta: published
          ? `${item.projectName} · 已发布给项目方`
          : `${item.projectName} · 内部缺口，项目方尚未看到`,
        listDue: published ? collabStatusLabel(published.status) : "未发布",
        published: Boolean(published),
        projectId: item.projectId,
        priority: item.priority,
      };
    });
  }, [openQuestions, publishedByProject]);

  const collabFocus = collabInbox[0]
    ? {
        id: `collab-${collabInbox[0].id}`,
        text: collabInbox[0].title,
        title: collabInbox[0].title,
        detail: collabInbox[0].body ?? "",
        meta: collabInbox[0].projectName ?? "项目方协作",
        due: collabInbox[0].dueAt
          ? `截止 ${collabInbox[0].dueAt.slice(0, 10)}`
          : "待回复",
        color: C.wine,
        to: `/app/collab/${collabInbox[0].projectId}/items/${collabInbox[0].id}`,
        listMeta: collabInbox[0].projectName ?? "",
        listDue: collabInbox[0].dueAt ? collabInbox[0].dueAt.slice(0, 10) : "",
        published: true,
        projectId: collabInbox[0].projectId,
        priority: collabInbox[0].priority,
      }
    : null;
  const focusTodo = todos[0] ?? collabFocus;
  const displayTodos = todos.slice(0, 3);
  const showInvestorTodos = hasInvestorProject;
  const showIssuerTodos = hasIssuerProject;

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

        {/* 焦点卡：最紧急待确认问题（对齐原型 homeFocus） */}
        {focusTodo ? (
          <Link
            to={focusTodo.to}
            onClick={() => rememberPublishDraft(focusTodo)}
            className="block transition-shadow"
            style={{
              marginTop: 36,
              background: `linear-gradient(120deg, ${C.wine} 0%, ${C.wineDeep} 100%)`,
              borderRadius: 24,
              padding: "36px 40px",
              boxShadow: "0 18px 44px rgba(139,31,36,0.26)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow =
                "0 22px 54px rgba(139,31,36,0.34)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow =
                "0 18px 44px rgba(139,31,36,0.26)";
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.78)",
                letterSpacing: "1.5px",
              }}
            >
              {focusTodo.to.includes("/collab/") && hasIssuerProject && !hasInvestorProject
                ? "今天最重要的协作事项"
                : "今天最重要的一件事"}
            </div>
            <div
              className="font-display"
              style={{
                marginTop: 12,
                fontSize: 29,
                fontWeight: 600,
                color: "#fff",
                lineHeight: 1.4,
              }}
            >
              {focusTodo.title}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 15.5,
                color: "rgba(255,255,255,0.86)",
                lineHeight: 1.65,
              }}
            >
              {focusTodo.meta} · {focusTodo.due}
              ；详见下方待办列表。
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 28,
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.82)",
                }}
              >
                {focusTodo.due}
              </span>
              <span
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
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {focusTodo.to.startsWith("/app/collab/")
                  ? "查看事项"
                  : focusTodo.published
                    ? "查看发布进度"
                    : "发布给项目方"} →
              </span>
            </div>
          </Link>
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
                    : projects.length > 0
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
                    : projects.length > 0
                    ? "知识网络「待确认问题」是投资团队内部缺口，项目方默认看不到。请到项目「项目方协作」发布后再等答复。"
                    : "暂无进行中的项目。前往项目库创建或加入协作。"}
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
                ? `${displayTodos.length} 项 · 仅投资团队可见`
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
          来自知识网络，默认只有投资团队能看到。点进去改成对外措辞并发布后，项目方才会出现待办。
        </p>
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
              暂无内部待确认问题。生成知识网络该章节后，会汇总在此；发布给项目方后对方才能答复。
            </p>
          ) : (
            displayTodos.map((t) => (
              <Link
                key={t.id}
                to={t.to}
                onClick={() => rememberPublishDraft(t)}
                className="transition-colors"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "20px 6px",
                  borderBottom: `1px solid ${C.line}`,
                  textDecoration: "none",
                  color: "inherit",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(160,99,88,0.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
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
                <span
                  style={{
                    fontSize: 14,
                    color: C.muted,
                    flexShrink: 0,
                  }}
                >
                  {t.listDue}
                </span>
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
                项目方待办
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
                collabInbox.slice(0, 5).map((it) => (
                <Link
                  key={it.id}
                  to={`/app/collab/${it.projectId}/items/${it.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    padding: "20px 6px",
                    borderBottom: `1px solid ${C.line}`,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 16.5,
                        fontWeight: 600,
                        color: C.ink,
                      }}
                    >
                      {it.title}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 13.5,
                        color: C.muted,
                      }}
                    >
                      {it.projectName ?? ""} · {collabStatusLabel(it.status)}
                      {it.dueAt ? ` · 截止 ${it.dueAt.slice(0, 10)}` : ""}
                    </div>
                  </div>
                  <span style={{ color: C.wine }}>→</span>
                </Link>
              ))
              )}
            </div>
          </>
        ) : null}

        {/* 进行中的项目 */}
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
      </div>
    </WorkspaceShell>
  );
}
