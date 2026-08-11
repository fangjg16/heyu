import { useCallback, useEffect, useState } from "react";
import {
  ProjectRelationGraph,
  parseProjectGraphHtml,
  type ProjectGraphData,
} from "@/components/workspace/ProjectRelationGraph";
import { fetchProjectKnowledgeChapter } from "@/lib/project-api";
import type { WorkspaceProject } from "@/workspace/projects";

type ProjectOverviewPanelProps = {
  project: WorkspaceProject;
  userId: string;
  refreshKey?: number;
};

/** 项目概览：展示 HTML（含时间轴）+ 关系图 JSON */
export function ProjectOverviewPanel({
  project,
  userId,
  refreshKey = 0,
}: ProjectOverviewPanelProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [graph, setGraph] = useState<ProjectGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!project.id || !userId.trim()) {
      setHtml(null);
      setGraph(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [overview, graphRow] = await Promise.all([
        fetchProjectKnowledgeChapter(project.id, "project-overview", userId),
        fetchProjectKnowledgeChapter(project.id, "project-graph", userId).catch(
          () => null,
        ),
      ]);
      setHtml(overview.html?.trim() ? overview.html : null);
      setGraph(parseProjectGraphHtml(graphRow?.html ?? null));
    } catch (e) {
      setHtml(null);
      setGraph(null);
      setError(e instanceof Error ? e.message : "加载项目概览失败");
    } finally {
      setLoading(false);
    }
  }, [project.id, userId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <p className="text-[13px] text-[#969E9A]">加载项目概览…</p>
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl border border-[rgba(202,33,55,0.25)] bg-[rgba(202,33,55,0.06)] px-3.5 py-2 text-[12.5px] text-[#CA2137]">
        {error}
      </p>
    );
  }

  if (!html?.trim() && !graph) {
    return (
      <div className="flex min-h-[280px] items-center justify-center px-8 py-16">
        <p className="max-w-md text-center text-[13px] leading-relaxed text-[#969E9A]">
          尚无项目概览。请点击顶栏「更新概览」，根据模板与上传资料生成（含时间轴与关系图）。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {html?.trim() ? (
        <div
          className="kn-project-overview-html text-[13.5px] leading-[1.75] text-[#1F2423] [&_b]:font-semibold [&_li]:my-1 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[rgba(78,66,57,0.12)] [&_td]:px-3 [&_td]:py-2 [&_th]:whitespace-nowrap [&_th]:border [&_th]:border-[rgba(78,66,57,0.12)] [&_th]:bg-[rgba(78,66,57,0.05)] [&_th]:px-3 [&_th]:py-2 [&_ul]:my-2 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
      {graph ? (
        <ProjectRelationGraph data={graph} projectId={project.id} />
      ) : null}
    </div>
  );
}
