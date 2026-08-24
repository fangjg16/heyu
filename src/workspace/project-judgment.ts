import { normalizeProjectPhase, type ProjectPhase } from "@/workspace/projects";

/** 与总览/原型一致的判断胶囊 */
export function judgmentFromPhase(phase: ProjectPhase | string | undefined): {
  label: string;
  bg: string;
  fg: string;
} {
  const safe = normalizeProjectPhase(phase);
  if (safe === "已暂停") {
    return { label: "已暂停", bg: "rgba(78,66,57,0.08)", fg: "#59625F" };
  }
  if (safe === "已完成") {
    return {
      label: "已完成",
      bg: "rgba(94,155,117,0.16)",
      fg: "#3F6F63",
    };
  }
  if (safe === "已归档") {
    return { label: "已归档", bg: "rgba(78,66,57,0.08)", fg: "#59625F" };
  }
  return {
    label: "进行中",
    bg: "#FBF1E2",
    fg: "#B07d1f",
  };
}
