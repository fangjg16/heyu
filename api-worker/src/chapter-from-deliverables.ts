import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { readCurrentMarkdownAtPath } from "./ai-generated-documents";
import {
  deliverableRelativePath,
  deliverablesForKnSection,
  type DeliverableFile,
} from "./deliverable-catalog";
import { renderDeliverableChapterHtml } from "./kn-md-render";
import { markdownForKnDisplay } from "./kn-md-translate";
import type { LlmClientEnv } from "./llm-client";
import type { AnalysisKind } from "./analysis-kind";

type Env = { DB: AppDatabase; FILES?: AppObjectStorage } & Partial<LlmClientEnv>;

export async function renderKnSectionFromDeliverables(
  env: Env,
  projectId: string,
  kind: AnalysisKind,
  sectionId: string,
): Promise<string> {
  const files = deliverablesForKnSection(kind, sectionId);
  const loaded: { title: string; markdown: string; id: string }[] = [];
  for (const file of files) {
    const markdown =
      env.FILES
        ? ((await readCurrentMarkdownAtPath(
            { DB: env.DB, FILES: env.FILES },
            projectId,
            deliverableRelativePath(file),
            file.filename,
          )) ?? "")
        : "";
    loaded.push({ title: file.title, markdown, id: file.id });
  }
  const displayed: { title: string; markdown: string; id: string }[] = [];
  for (const item of loaded) {
    if (!item.markdown.trim()) {
      displayed.push(item);
      continue;
    }
    const { markdown } = await markdownForKnDisplay(
      env as LlmClientEnv,
      item.markdown,
    );
    displayed.push({ ...item, markdown });
  }
  return renderDeliverableChapterHtml(displayed);
}

export function knSectionRendersFromFiles(
  kind: AnalysisKind,
  sectionId: string,
): boolean {
  if (sectionId === "project-overview") return false;
  return deliverablesForKnSection(kind, sectionId).length > 0;
}

export type { DeliverableFile };
