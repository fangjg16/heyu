import type { WorkspaceRole } from "./types";

/** 总览详情面板档位（与对话区 full/mid/low 对应，另含 guest） */
export type ProjectDetailTier = "guest" | "low" | "mid" | "full";

export function workspaceRoleToDetailTier(
  role: WorkspaceRole
): ProjectDetailTier {
  switch (role) {
    case "guest":
      return "guest";
    case "low":
      return "low";
    case "mid":
      return "mid";
    case "admin":
    case "core":
      return "full";
    default:
      return "guest";
  }
}
