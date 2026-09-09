import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { readCurrentMarkdownAtPath } from "./ai-generated-documents";
import { AI_GENERATED_ROOT } from "./ai-generated-path";
import {
  deliverableRelativePath,
  deliverablesForKnSection,
  headingSlicesForDeliverable,
  type DeliverableFile,
} from "./deliverable-catalog";
import { extractMarkdownHeadingSlices } from "./kn-md-headings";
import { renderDeliverableChapterHtml } from "./kn-md-render";
import type { AnalysisKind } from "./analysis-kind";

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

export async function renderKnSectionFromDeliverables(
  env: Env,
  projectId: string,
  kind: AnalysisKind,
  sectionId: string,
): Promise<string> {
  const files = deliverablesForKnSection(kind, sectionId);
  const loaded: { title: string; markdown: string; id: string }[] = [];
  for (const file of files) {
    const raw = await readDeliverableMarkdown(env, projectId, file);
    const slices = headingSlicesForDeliverable(file, sectionId);
    const markdown =
      slices?.length && raw.trim()
        ? extractMarkdownHeadingSlices(raw, slices)
        : raw;
    loaded.push({ title: file.title, markdown, id: file.id });
  }
  return renderDeliverableChapterHtml(loaded);
}

export function knSectionRendersFromFiles(
  kind: AnalysisKind,
  sectionId: string,
): boolean {
  if (sectionId === "project-overview") return false;
  return deliverablesForKnSection(kind, sectionId).length > 0;
}

export type { DeliverableFile };
