import type { ProjectPhase } from "@/workspace/projects";

/** 与总览/原型一致的判断胶囊 */
export function judgmentFromPhase(phase: ProjectPhase | string | undefined): {
  label: string;
  bg: string;
  fg: string;
} {
  const p = String(phase ?? "");
  if (p.startsWith("Paused")) {
    return { label: "暂缓", bg: "rgba(78,66,57,0.08)", fg: "#59625F" };
  }
  if (p.startsWith("Completed")) {
    return {
      label: "继续推进",
      bg: "rgba(94,155,117,0.16)",
      fg: "#3F6F63",
    };
  }
  if (p.startsWith("Cancelled")) {
    return { label: "已取消", bg: "rgba(78,66,57,0.08)", fg: "#59625F" };
  }
  return {
    label: "研究中",
    bg: "#FBF1E2",
    fg: "#B07d1f",
  };
}
