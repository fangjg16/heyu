import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { readCurrentMarkdownAtPath } from "./ai-generated-documents";
import { AI_GENERATED_ROOT } from "./ai-generated-path";
import {
  capitallensKnSources,
  DILIGENCE_SIGNAL_FILE_IDS,
  resolveKnWorkstream,
  sliceDeliverableForKn,
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
  markdownHasBody,
  renderDeliverableChapterHtml,
} from "./kn-md-render";
import type { AnalysisKind } from "./analysis-kind";
import { getProjectById } from "./projects-db";

type Env = { DB: AppDatabase; FILES?: AppObjectStorage };

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

async function projectHasDiligenceBody(
  env: Env,
  projectId: string,
): Promise<boolean> {
  for (const id of DILIGENCE_SIGNAL_FILE_IDS) {
    const file = deliverableById("mature", id);
    if (!file) continue;
    const raw = await readDeliverableMarkdown(env, projectId, file);
    if (markdownHasBody(raw)) return true;
  }
  return false;
}

export async function resolveProjectKnWorkstream(
  env: Env,
  projectId: string,
  kind: AnalysisKind,
): Promise<KnWorkstream | undefined> {
  if (kind !== "mature") return undefined;
  const project = await getProjectById(env, projectId).catch(() => null);
  const hasDiligenceBody = await projectHasDiligenceBody(env, projectId);
  return resolveKnWorkstream({
    pipelineStage: project?.pipelineStage ?? null,
    hasDiligenceBody,
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

export type { DeliverableFile };
