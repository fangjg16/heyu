import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateProjectViaApi } from "@/lib/project-api";
import { IndustryCategoryFields, RequiredMark } from "@/components/workspace/IndustryCategoryFields";
import { AnalysisKindFields } from "@/components/workspace/AnalysisKindFields";
import { parseAnalysisKind, type AnalysisKind } from "@/lib/analysis-kind";
import {
  isCompletedPipelineStage,
  parsePipelineStage,
  pipelineStageOptionsForEdit,
  type PipelineStage,
} from "@/workspace/pipeline-stage";
import {
  formatIndustryCategory,
  parseIndustryCategory,
  UNCATEGORIZED_LABEL,
} from "@/workspace/industry-taxonomy";
import { useIndustryTaxonomy } from "@/workspace/use-industry-taxonomy";
import { isPlatformAdminUser } from "@/workspace/workspace-users";
import {
  PROJECT_PHASES,
  projectPhaseLabel,
  type ProjectOpenness,
  type ProjectPhase,
  type WorkspaceProject,
} from "@/workspace/projects";

const PHASE_OPTIONS: ProjectPhase[] = [...PROJECT_PHASES];

const OPENNESS_OPTIONS: {
  value: ProjectOpenness;
  title: string;
  description: string;
}[] = [
  {
    value: "partial",
    title: "全开放",
    description:
      "内部账号可在项目广场发现该项目；未加入者可申请加入。",
  },
  {
    value: "invite",
    title: "内部邀请",
    description: "仅创建人与已加入成员可在项目库看到该项目。",
  },
];

function normalizeOpenness(raw: unknown): ProjectOpenness {
  return String(raw ?? "").trim().toLowerCase() === "invite" ? "invite" : "partial";
}

type ProjectEditModalProps = {
  /** 稳定主键（勿随表单名称变化） */
  projectId: string;
  project: WorkspaceProject;
  userId: string;
  open: boolean;
  onClose: () => void;
  onSaved: (project: WorkspaceProject) => void;
};

export function ProjectEditModal({
  projectId,
  project,
  userId,
  open,
  onClose,
  onSaved,
}: ProjectEditModalProps) {
  const [name, setName] = useState(project.name);
  const [detail, setDetail] = useState(project.summary);
  const [industryTheme, setIndustryTheme] = useState("");
  const [industrySector, setIndustrySector] = useState("");
  const [legacyCategory, setLegacyCategory] = useState<string | null>(null);
  const industryTaxonomy = useIndustryTaxonomy();
  const canEditTaxonomyMd = isPlatformAdminUser(userId);
  const [phase, setPhase] = useState<ProjectPhase>(project.phase);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(
    parsePipelineStage(project.pipelineStage),
  );
  const [analysisKind, setAnalysisKind] = useState<AnalysisKind | "">(
    parseAnalysisKind(project.analysisKind) ?? "",
  );
  const [openness, setOpenness] = useState<ProjectOpenness>(
    normalizeOpenness(project.openness),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setDetail(project.summary);
    const parsed = parseIndustryCategory(project.category, industryTaxonomy);
    setIndustryTheme(parsed.theme);
    setIndustrySector(parsed.sector);
    setLegacyCategory(
      parsed.custom && project.category.trim() && project.category !== UNCATEGORIZED_LABEL
        ? project.category.trim()
        : null,
    );
    setPhase(project.phase);
    setPipelineStage(parsePipelineStage(project.pipelineStage));
    setAnalysisKind(parseAnalysisKind(project.analysisKind) ?? "");
    setOpenness(normalizeOpenness(project.openness));
    setError(null);
  }, [open, project]);

  if (!open) return null;

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("请填写项目名称");
      return;
    }
    if (!analysisKind) {
      setError("请选择项目形态");
      return;
    }
    if (
      analysisKind === "mature" &&
      phase === "已完成" &&
      !isCompletedPipelineStage(pipelineStage)
    ) {
      setError("已完成须选择已投或不投");
      return;
    }
    setSaving(true);
    setError(null);
    void updateProjectViaApi(projectId, {
      name: trimmedName,
      detail: detail.trim(),
      category: formatIndustryCategory(industryTheme, industrySector),
      phase,
      openness,
      analysisKind,
      pipelineStage:
        analysisKind === "mature"
          ? pipelineStage ?? (phase === "已完成" ? null : "inbound")
          : null,
      userId,
    })
      .then((updated) => {
        onSaved(updated);
        onClose();
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "保存失败");
      })
      .finally(() => setSaving(false));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-edit-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h3 id="project-edit-title" className="text-base font-bold text-foreground">
            编辑项目
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block text-sm">
            <span className="font-medium text-foreground">
              项目名称
              <RequiredMark />
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">项目简介</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={4}
              className="mt-1.5 w-full resize-y rounded-lg border border-border/70 px-3 py-2 text-sm"
            />
          </label>
          <div className="block text-sm">
            <IndustryCategoryFields
              theme={industryTheme}
              sector={industrySector}
              onThemeChange={(t) => {
                setIndustryTheme(t);
                setLegacyCategory(null);
              }}
              onSectorChange={(s) => {
                setIndustrySector(s);
                setLegacyCategory(null);
              }}
              taxonomy={industryTaxonomy}
              legacyLabel={legacyCategory}
              themeRequired
              editorHref={canEditTaxonomyMd ? "/app/admin/taxonomy" : null}
            />
          </div>
          <label className="block text-sm">
            <span className="font-medium text-foreground">项目状态</span>
            <select
              value={phase}
              onChange={(e) => {
                const next = e.target.value as ProjectPhase;
                setPhase(next);
                if (analysisKind !== "mature") return;
                if (next === "已完成") {
                  if (!isCompletedPipelineStage(pipelineStage)) {
                    setPipelineStage(null);
                  }
                } else if (next === "进行中") {
                  if (isCompletedPipelineStage(pipelineStage)) {
                    setPipelineStage("ic-review");
                  } else if (!pipelineStage) {
                    setPipelineStage("inbound");
                  }
                }
              }}
              className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm"
            >
              {PHASE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {projectPhaseLabel(p)}
                </option>
              ))}
            </select>
          </label>
          {analysisKind === "mature" ? (
            <label className="block text-sm">
              <span className="font-medium text-foreground">投资阶段</span>
              <select
                value={pipelineStage ?? ""}
                onChange={(e) =>
                  setPipelineStage(parsePipelineStage(e.target.value))
                }
                className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm"
              >
                {phase === "已完成" && !pipelineStage ? (
                  <option value="">请选择已投或不投</option>
                ) : null}
                {pipelineStageOptionsForEdit(phase).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                待筛选在首次生成章节草案后会自动进入筛选。已投默认从投委推进，编辑页也可直接改。
              </p>
            </label>
          ) : null}
          <AnalysisKindFields
            value={analysisKind}
            onChange={(kind) => {
              setAnalysisKind(kind);
              if (kind === "early") setOpenness("invite");
              if (kind === "mature") {
                setPipelineStage((cur) => {
                  if (cur) return cur;
                  if (phase === "已完成") return null;
                  return "inbound";
                });
              } else {
                setPipelineStage(null);
              }
            }}
            originalKind={parseAnalysisKind(project.analysisKind)}
          />
          <div className="block text-sm">
            <span className="font-medium text-foreground">
              项目开放程度
              <RequiredMark />
            </span>
            <select
              value={openness}
              onChange={(e) => setOpenness(e.target.value as ProjectOpenness)}
              className="mt-1.5 w-full rounded-lg border border-border/70 px-3 py-2 text-sm"
              aria-label="项目开放程度"
            >
              {OPENNESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.title}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {OPENNESS_OPTIONS.find((item) => item.value === openness)?.description}
            </p>
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={cn(
              "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
              saving && "opacity-80",
            )}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
