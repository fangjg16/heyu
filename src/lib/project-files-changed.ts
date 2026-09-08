export const PROJECT_FILES_CHANGED_EVENT = "heyu-project-files-changed";

export function notifyProjectFilesChanged(projectId: string): void {
  if (typeof window === "undefined") return;
  const id = projectId.trim();
  if (!id) return;
  window.dispatchEvent(
    new CustomEvent(PROJECT_FILES_CHANGED_EVENT, { detail: { projectId: id } }),
  );
}

export function subscribeProjectFilesChanged(
  projectId: string,
  onChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const id = projectId.trim();
  const handler = (e: Event) => {
    const changed = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
    if (!changed || changed === id) onChange();
  };
  window.addEventListener(PROJECT_FILES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PROJECT_FILES_CHANGED_EVENT, handler);
}
