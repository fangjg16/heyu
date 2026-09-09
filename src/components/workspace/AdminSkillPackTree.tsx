import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminSkillRow } from "@/lib/admin-skills-api";
import { skillFilePathsToTree, type SkillFileNode } from "@/lib/skill-file-tree";
import { SKILL_PACKS, type SkillPackId } from "@/lib/skill-packs";

function syncBadge(status: AdminSkillRow["syncStatus"]) {
  if (status === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "not_in_db") {
    return "border-slate-300 bg-slate-50 text-slate-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function syncLabel(status: AdminSkillRow["syncStatus"]) {
  if (status === "ok") return "已同步到卷";
  if (status === "error") return "同步失败";
  if (status === "not_in_db") return "本地未入库";
  return "待同步";
}

function FileBranch({
  nodes,
  depth,
  onOpenFile,
}: {
  nodes: SkillFileNode[];
  depth: number;
  onOpenFile: (path: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.kind === "dir" ? (
            <div>
              <p
                className="flex items-center gap-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                style={{ paddingLeft: 8 + depth * 14 }}
              >
                <Folder className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate font-mono">{node.name}</span>
              </p>
              <FileBranch
                nodes={node.children}
                depth={depth + 1}
                onOpenFile={onOpenFile}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenFile(node.path)}
              className="flex w-full items-center gap-1.5 rounded-md py-0.5 text-left text-[11px] text-foreground/85 hover:bg-white"
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              <FileText
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="truncate font-mono">{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AdminSkillPackTree({
  skillsByPack,
  onEdit,
  onDelete,
  onRetry,
}: {
  skillsByPack: Array<{
    id: SkillPackId;
    label: string;
    skills: AdminSkillRow[];
  }>;
  onEdit: (name: string, filePath?: string) => void;
  onDelete: (name: string) => void;
  onRetry: (name: string) => void;
}) {
  const [openPacks, setOpenPacks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SKILL_PACKS.map((p) => [p.id, true])),
  );
  const [openSkills, setOpenSkills] = useState<Record<string, boolean>>({});

  const trees = useMemo(() => {
    const map = new Map<string, ReturnType<typeof skillFilePathsToTree>>();
    for (const group of skillsByPack) {
      for (const s of group.skills) {
        map.set(s.name, skillFilePathsToTree(s.filePaths));
      }
    }
    return map;
  }, [skillsByPack]);

  return (
    <div className="mt-4 space-y-3">
      {skillsByPack.map((group) => {
        const packOpen = openPacks[group.id] !== false;
        return (
          <div
            key={group.id}
            className="overflow-hidden rounded-xl border border-border/70"
          >
            <button
              type="button"
              onClick={() =>
                setOpenPacks((prev) => ({
                  ...prev,
                  [group.id]: !packOpen,
                }))
              }
              className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left"
            >
              {packOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Folder className="h-3.5 w-3.5 text-[hsl(var(--wine-deep))]" />
              <span className="text-[12px] font-semibold text-foreground">
                {group.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {group.id}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {group.skills.length} 个
              </span>
            </button>
            {packOpen ? (
              <ul className="divide-y divide-border/50">
                {group.skills.map((s) => {
                  const skillOpen = Boolean(openSkills[s.name]);
                  const fileTree = trees.get(s.name) ?? [];
                  return (
                    <li key={s.name} id={`admin-skill-${s.name}`}>
                      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenSkills((prev) => ({
                                ...prev,
                                [s.name]: !skillOpen,
                              }))
                            }
                            className="flex w-full items-start gap-2 text-left"
                          >
                            {skillOpen ? (
                              <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {s.title}
                              </span>
                              {s.description ? (
                                <span className="mt-0.5 block line-clamp-2 text-[12px] text-foreground/80">
                                  {s.description}
                                </span>
                              ) : null}
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                {s.name}
                                {s.inDatabase
                                  ? ` · ${s.fileCount} 文件`
                                  : " · 仅本地"}
                                {s.onVolume && s.inDatabase ? " · 卷上有" : ""}
                                {s.intents.length > 0
                                  ? ` · 路由：${s.intents.join(", ")}`
                                  : ""}
                              </span>
                            </span>
                          </button>
                          {skillOpen && fileTree.length > 0 ? (
                            <div className="mt-1.5 ml-5 rounded-lg bg-muted/30 py-1.5 pr-2">
                              <FileBranch
                                nodes={fileTree}
                                depth={0}
                                onOpenFile={(path) => onEdit(s.name, path)}
                              />
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                              syncBadge(s.syncStatus),
                            )}
                            title={s.syncError ?? undefined}
                          >
                            {syncLabel(s.syncStatus)}
                          </span>
                          {s.syncStatus === "error" ? (
                            <button
                              type="button"
                              onClick={() => onRetry(s.name)}
                              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                            >
                              重试同步
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onEdit(s.name)}
                            className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-white px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted/40"
                          >
                            <Pencil className="h-3 w-3" aria-hidden />
                            {s.syncStatus === "not_in_db"
                              ? "入库并编辑"
                              : "编辑"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(s.name)}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-200/80 bg-rose-50/70 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden />
                            删除
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
