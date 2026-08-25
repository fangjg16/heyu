import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, FileText, Folder, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectFileRecord } from "@/lib/project-api";
import { isHiddenKeep, type FileTreeNode } from "@/lib/project-file-tree";
import { buildSourceMaterialsTree } from "@/lib/project-file-source";

export const SOURCE_FILE_DRAG_TYPE = "application/x-heyu-source-file";

export type SourceFileDragPayload = {
  id: string;
  filename: string;
};

export function parseSourceFileDrag(data: DataTransfer): SourceFileDragPayload | null {
  const raw = data.getData(SOURCE_FILE_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SourceFileDragPayload;
    if (parsed?.id && parsed.filename) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

type ChatSourceFilesPanelProps = {
  files: ProjectFileRecord[];
  loading: boolean;
  referencedIds: Set<string>;
  materialsHref: string;
  materialsState?: { fromConversation?: string };
  onRememberReturn?: () => void;
  onPickFile: (file: ProjectFileRecord) => void;
  onClose: () => void;
};

function SourceTreeNodes({
  nodes,
  depth,
  collapsed,
  referencedIds,
  onToggle,
  onPickFile,
}: {
  nodes: FileTreeNode[];
  depth: number;
  collapsed: Set<string>;
  referencedIds: Set<string>;
  onToggle: (path: string) => void;
  onPickFile: (file: ProjectFileRecord) => void;
}) {
  return (
    <ul
      className={cn(
        "space-y-0.5",
        depth > 0 && "ml-1.5 border-l border-[rgba(78,66,57,0.12)] pl-1.5",
      )}
    >
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const isOpen = !collapsed.has(node.path);
          const hasKids = node.children.length > 0;
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggle(node.path)}
                className={cn(
                  "flex w-full items-center gap-1 rounded-lg py-0.5 pr-1.5 text-left hover:bg-white/80 hover:text-foreground",
                  "text-[12px] leading-4 text-muted-foreground",
                  depth === 0 && "font-medium",
                )}
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                )}
                <Folder className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 truncate">{node.name}</span>
              </button>
              {isOpen && hasKids ? (
                <SourceTreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  collapsed={collapsed}
                  referencedIds={referencedIds}
                  onToggle={onToggle}
                  onPickFile={onPickFile}
                />
              ) : null}
            </li>
          );
        }
        const active = referencedIds.has(node.file.id);
        return (
          <li key={node.id}>
            <button
              type="button"
              draggable
              title="拖到输入框可引用；点击也可加入"
              onDragStart={(e) => {
                const payload: SourceFileDragPayload = {
                  id: node.file.id,
                  filename: node.file.filename,
                };
                e.dataTransfer.setData(SOURCE_FILE_DRAG_TYPE, JSON.stringify(payload));
                e.dataTransfer.setData("text/plain", node.file.filename);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onPickFile(node.file)}
              className={cn(
                "flex w-full cursor-grab items-center gap-1 rounded-lg py-0.5 pr-1.5 text-left text-[12px] leading-4 active:cursor-grabbing",
                active
                  ? "bg-[hsl(var(--wine-deep)/0.1)] font-medium text-[hsl(var(--wine-deep))]"
                  : "text-muted-foreground hover:bg-white/80 hover:text-foreground",
              )}
            >
              <span className="inline-block h-3 w-3 shrink-0" aria-hidden />
              <FileText className="h-3 w-3 shrink-0 opacity-70" strokeWidth={1.8} />
              <span className="min-w-0 truncate">{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ChatSourceFilesPanel({
  files,
  loading,
  referencedIds,
  materialsHref,
  materialsState,
  onRememberReturn,
  onPickFile,
  onClose,
}: ChatSourceFilesPanelProps) {
  const tree = useMemo(
    () => buildSourceMaterialsTree(files.filter((f) => !isHiddenKeep(f))),
    [files],
  );
  const visible = tree.children.filter(
    (n) => n.kind === "folder" && n.children.length > 0,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-l border-[rgba(78,66,57,0.1)] bg-[rgba(248,243,238,0.92)] backdrop-blur-md md:w-[14.5rem]">
      <div className="flex h-[3.25rem] items-center gap-2 border-b border-[rgba(78,66,57,0.1)] px-3">
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-[#1F2423]">
          项目源文件
        </p>
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[hsl(var(--wine)/0.08)] hover:text-[hsl(var(--wine))] active:scale-[0.97]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="px-2 py-3 text-[13px] text-muted-foreground">加载源文件…</p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-3 text-[13px] leading-relaxed text-muted-foreground">
            还没有源文件
          </p>
        ) : (
          <SourceTreeNodes
            nodes={visible}
            depth={0}
            collapsed={collapsed}
            referencedIds={referencedIds}
            onToggle={(path) => {
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              });
            }}
            onPickFile={onPickFile}
          />
        )}
      </nav>
      <div className="shrink-0 border-t border-[rgba(78,66,57,0.1)] px-3 py-2.5">
        <Link
          to={materialsHref}
          state={materialsState}
          onClick={onRememberReturn}
          className="inline-flex h-8 items-center text-[13px] font-medium text-[hsl(var(--wine-deep))] hover:underline"
        >
          在源文件页管理
        </Link>
      </div>
    </aside>
  );
}
