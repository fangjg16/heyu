import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  ENABLE_LIVE_CHAT,
  fetchMyOpenQuestions,
  fetchProjectsFromApi,
  type MyOpenQuestionItem,
} from "@/lib/project-api";
import { filterProjectsForUser } from "@/workspace/guest-access";
import {
  getMergedProjects,
  setApiProjects,
  sortProjectsForOverview,
} from "@/workspace/project-registry";
import { loadSessionUserId } from "@/workspace/session";
import { getUserById } from "@/workspace/workspace-users";
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

export default function HomeDashboard() {
  const userId = loadSessionUserId();
  const user = getUserById(userId);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [todos, setTodos] = useState<
    {
      id: string;
      text: string;
      meta: string;
      due: string;
      color: string;
      to: string;
      listMeta: string;
      listDue: string;
    }[]
  >([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todosError, setTodosError] = useState<string | null>(null);

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
      setTodos([]);
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
        setTodos(
          data.items.map((item) => ({
            id: item.id,
            text: item.text,
            meta: item.projectName,
            due: item.priorityLabel,
            color: priorityColor(item.priority),
            to: `/app/projects/${encodeURIComponent(item.projectId)}/knowledge?section=questions`,
            listMeta: `${item.projectName} · ${item.priority} 待确认问题`,
            listDue:
              item.priority === "P1"
                ? "阻塞"
                : item.priority === "P2"
                  ? "重要"
                  : "跟进",
          })),
        );
      } catch (e) {
        if (cancelled) return;
        setTodos([]);
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

  const now = useMemo(() => new Date(), []);
  const shortName = shortDisplayName(user?.displayName);
  const greeting = shortName
    ? `${greetingForHour(now.getHours())}，${shortName}`
    : greetingForHour(now.getHours());

  const shortList = projects.slice(0, 3);
  const focusTodo = todos[0] ?? null;
  const displayTodos = todos.slice(0, 3);

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
              今天最重要的一件事
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
              {focusTodo.meta} · {focusTodo.text}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 15.5,
                color: "rgba(255,255,255,0.86)",
                lineHeight: 1.65,
              }}
            >
              来自待确认问题清单的 {focusTodo.due}
              项；建议优先处理。
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
                查看缺口 →
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
                  : projects.length > 0
                    ? "生成知识网络「待确认问题」章节后，最紧急项将显示在此。"
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
            我的待办
          </div>
          <span style={{ fontSize: 14, color: C.muted }}>
            {todosLoading
              ? "…"
              : displayTodos.length > 0
                ? `${displayTodos.length} 项 · 按优先级排序`
                : "—"}
          </span>
        </div>
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
              暂无待确认问题。生成知识网络「待确认问题」章节后将在此汇总。
            </p>
          ) : (
            displayTodos.map((t) => (
              <Link
                key={t.id}
                to={t.to}
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
                  <div style={{ fontSize: 16.5, color: C.ink }}>{t.text}</div>
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
                to={`/app/projects/${p.id}/overview`}
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
