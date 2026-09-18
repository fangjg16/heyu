import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { readCurrentMarkdownAtPath } from "./ai-generated-documents";
import { AI_GENERATED_ROOT } from "./ai-generated-path";
import {
  assembleScreeningChapterMarkdown,
  capitallensKnSources,
  resolveKnWorkstream,
  sliceDeliverableForKn,
  SCREENING_KN_FLOORS,
  type KnWorkstream,
} from "./capitallens-kn-map";
import {
  deliverableById,
  deliverableRelativePath,
  deliverablesForKnSection,
  headingSlicesForDeliverable,
  type DeliverableFile,
} from "./deliverable-catalog";
import {
  extractMarkdownHeadingSlices,
  extractNumberedMarkdownChapter,
} from "./kn-md-headings";
import {
  renderDeliverableChapterHtml,
} from "./kn-md-render";
import { isDirectoryMarker } from "./documents-access";
import type { AnalysisKind } from "./analysis-kind";
import { getProjectById } from "./projects-db";

type Env = { DB: AppDatabase; FILES?: AppObjectStorage };

const COMPANY_TEAM_PACKAGE_HINT = /企查查交叉分析|4[-_]?公司与团队/u;

async function readPackageMarkdownByFilenameHint(
  env: Env,
  projectId: string,
  hint: RegExp,
): Promise<string> {
  if (!env.FILES) return "";
  try {
    const q = await env.DB.prepare(
      `SELECT filename, relative_path, r2_key, mime
       FROM documents
       WHERE project_id = ?
         AND scope = 'package'
       ORDER BY created_at DESC
       LIMIT 120`,
    )
      .bind(projectId)
      .all<{
        filename: string;
        relative_path: string | null;
        r2_key: string;
        mime: string | null;
      }>();
    const row = (q.results ?? []).find((r) => {
      if (isDirectoryMarker(r.mime, r.filename)) return false;
      const mime = (r.mime ?? "").toLowerCase();
      if (mime.includes("pdf")) return false;
      const name = `${r.relative_path ?? ""}/${r.filename}`;
      if (!hint.test(r.filename) && !hint.test(name)) return false;
      return (
        /\.(?:md|markdown|txt)$/iu.test(r.filename) ||
        mime.includes("markdown") ||
        mime.includes("text")
      );
    });
    if (!row) return "";
    const obj = await env.FILES.get(row.r2_key);
    if (!obj) return "";
    const text = (await obj.text()).trim();
    if (!text || text.includes("\u0000")) return "";
    return text;
  } catch {
    return "";
  }
}

function markdownCharCount(md: string): number {
  return md.replace(/\s+/gu, "").length;
}

async function preferLongerCompanyTeamSource(
  env: Env,
  projectId: string,
  files: Record<string, string>,
): Promise<void> {
  const fromPkg = await readPackageMarkdownByFilenameHint(
    env,
    projectId,
    COMPANY_TEAM_PACKAGE_HINT,
  );
  if (markdownCharCount(fromPkg) <= markdownCharCount(files["company-team-qcc"] ?? "")) {
    return;
  }
  files["company-team-qcc"] = fromPkg;
}

async function readDeliverableMarkdown(
  env: Env,
  projectId: string,
  file: DeliverableFile,
): Promise<string> {
  if (!env.FILES) return "";
  const current =
    (await readCurrentMarkdownAtPath(
      { DB: env.DB, FILES: env.FILES },
      projectId,
      deliverableRelativePath(file),
      file.filename,
    )) ?? "";
  if (current.trim()) return current;
  for (const old of file.legacy ?? []) {
    const md =
      (await readCurrentMarkdownAtPath(
        { DB: env.DB, FILES: env.FILES },
        projectId,
        `${AI_GENERATED_ROOT}/${file.pack}/${old.folder}`,
        old.filename,
      )) ?? "";
    if (md.trim()) return md;
  }
  return "";
}

export async function resolveProjectKnWorkstream(
  env: Env,
  projectId: string,
  kind: AnalysisKind,
): Promise<KnWorkstream | undefined> {
  if (kind !== "mature") return undefined;
  const project = await getProjectById(env, projectId).catch(() => null);
  return resolveKnWorkstream({
    pipelineStage: project?.pipelineStage ?? null,
  });
}

function sliceCatalogMarkdown(
  raw: string,
  file: DeliverableFile,
  sectionId: string,
): string {
  const slices = headingSlicesForDeliverable(file, sectionId);
  if (!slices?.length || !raw.trim()) return raw;
  const cut = extractMarkdownHeadingSlices(raw, slices);
  if (cut.trim()) return cut;
  if (sectionId === "project-summary") {
    return extractNumberedMarkdownChapter(raw, 1);
  }
  return "";
}

export async function renderKnSectionFromDeliverables(
  env: Env,
  projectId: string,
  kind: AnalysisKind,
  sectionId: string,
): Promise<string> {
  const workstream = await resolveProjectKnWorkstream(env, projectId, kind);
  const specs =
    kind === "mature" && workstream
      ? capitallensKnSources(workstream, sectionId)
      : [];
  if (specs.length) {
    if (workstream === "screening") {
      const files: Record<string, string> = {};
      const seen = new Set<string>();
      for (const spec of specs) {
        if (seen.has(spec.fileId)) continue;
        seen.add(spec.fileId);
        const file = deliverableById(kind, spec.fileId);
        if (!file) continue;
        files[spec.fileId] = await readDeliverableMarkdown(env, projectId, file);
      }
      if (sectionId === "company-team") {
        await preferLongerCompanyTeamSource(env, projectId, files);
      }
      const markdown = assembleScreeningChapterMarkdown(sectionId, files);
      const floor = SCREENING_KN_FLOORS[sectionId];
      return renderDeliverableChapterHtml(
        [
          {
            title: floor?.title ?? "筛选备忘录",
            markdown,
            id: "screening-memo",
            phase: 1,
          },
        ],
        { keepSourceOrder: true },
      );
    }
    const loaded: { title: string; markdown: string; id: string; phase: number }[] =
      [];
    for (const spec of specs) {
      const file = deliverableById(kind, spec.fileId);
      if (!file) continue;
      const raw = await readDeliverableMarkdown(env, projectId, file);
      loaded.push({
        title: file.title,
        markdown: sliceDeliverableForKn(raw, spec),
        id: file.id,
        phase: file.phase,
      });
    }
    if (sectionId === "company-team") {
      const files: Record<string, string> = {};
      for (const item of loaded) files[item.id] = item.markdown;
      await preferLongerCompanyTeamSource(env, projectId, files);
      const qcc = files["company-team-qcc"] ?? "";
      if (qcc.trim()) {
        const idx = loaded.findIndex((item) => item.id === "company-team-qcc");
        if (idx >= 0) loaded[idx] = { ...loaded[idx]!, markdown: qcc };
        else {
          const file = deliverableById(kind, "company-team-qcc");
          loaded.unshift({
            title: file?.title ?? "公司与团队",
            markdown: qcc,
            id: "company-team-qcc",
            phase: file?.phase ?? 10,
          });
        }
      }
    }
    return renderDeliverableChapterHtml(loaded, {
      keepSourceOrder: true,
      keepExtras: true,
    });
  }

  const files = deliverablesForKnSection(kind, sectionId, workstream);
  const loaded: { title: string; markdown: string; id: string; phase: number }[] =
    [];
  for (const file of files) {
    const raw = await readDeliverableMarkdown(env, projectId, file);
    loaded.push({
      title: file.title,
      markdown: sliceCatalogMarkdown(raw, file, sectionId),
      id: file.id,
      phase: file.phase,
    });
  }
  return renderDeliverableChapterHtml(loaded);
}

export function knSectionRendersFromFiles(
  kind: AnalysisKind,
  sectionId: string,
): boolean {
  return deliverablesForKnSection(kind, sectionId).length > 0;
}

/** 成熟投资研究章一律从底稿装配，备忘录切空也用筛选大纲，不再改走大模型。 */
export function knSectionAlwaysAssembles(
  kind: AnalysisKind,
  sectionId: string,
): boolean {
  if (kind !== "mature") return false;
  return (
    capitallensKnSources("screening", sectionId).length > 0 ||
    capitallensKnSources("diligence", sectionId).length > 0
  );
}

export type { DeliverableFile };
