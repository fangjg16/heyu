/** 项目状态 */
export const PROJECT_PHASES = ["进行中", "已完成", "已归档", "已暂停"] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

/** 目录可见性：全开放 | 内部邀请（wire：partial | invite） */
export type ProjectOpenness = "partial" | "invite";

export type WorkspaceProject = {
  id: string;
  name: string;
  category: string;
  phase: ProjectPhase;
  /** 总览卡片摘要（含可量化信息，供非 Guest 角色） */
  summary: string;
  /** Guest 在卡片上仅见该句（不含具体机构/金额） */
  guestSummary: string;
  /** 目录可见性：partial=全开放；invite=仅成员可见 */
  openness?: ProjectOpenness;
  /** 云端新建项目：创建人 userId，用于编辑/删除鉴权 */
  createdBy?: string | null;
  /** 云端项目创建时间（ISO） */
  createdAt?: string | null;
  updatedAt?: string | null;
  /** 知识网络研究成熟度 0–100（列表接口聚合；缺省表示未知） */
  researchMaturity?: number | null;
};

export const DEFAULT_PROJECT_PHASE: ProjectPhase = "进行中";

const LEGACY_PHASE: Record<string, ProjectPhase> = {
  "Active（资源筹备中）": "进行中",
  Active: "进行中",
  资源筹备中: "进行中",
  进行中: "进行中",
  "Completed（已签约）": "已完成",
  Completed: "已完成",
  已签约: "已完成",
  已完成: "已完成",
  "Paused（暂停）": "已暂停",
  Paused: "已暂停",
  暂停: "已暂停",
  已暂停: "已暂停",
  "Cancelled（已取消）": "已归档",
  Cancelled: "已归档",
  已取消: "已归档",
  已归档: "已归档",
};

export function normalizeProjectPhase(raw: string | undefined | null): ProjectPhase {
  const p = (raw ?? "").trim();
  if ((PROJECT_PHASES as readonly string[]).includes(p)) return p as ProjectPhase;
  if (LEGACY_PHASE[p]) return LEGACY_PHASE[p];
  if (p.startsWith("Paused")) return "已暂停";
  if (p.startsWith("Completed")) return "已完成";
  if (p.startsWith("Cancelled")) return "已归档";
  if (p.startsWith("Active")) return "进行中";
  return DEFAULT_PROJECT_PHASE;
}

export function projectPhaseLabel(phase: ProjectPhase | undefined | null): string {
  return normalizeProjectPhase(phase);
}
