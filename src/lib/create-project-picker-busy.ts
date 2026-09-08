export type PickerKind = "file" | "folder";

export function pickerButtonBusy(
  ingesting: PickerKind | null,
  readingDrop: boolean,
): { file: boolean; folder: boolean } {
  if (ingesting === "file") return { file: true, folder: false };
  if (ingesting === "folder" || readingDrop) return { file: false, folder: true };
  return { file: false, folder: false };
}

/** 等一帧画完转圈，再扫 FileList，避免点「打开」后界面卡住没反馈。 */
export function afterPaint(fn: () => void): void {
  const ping = (cb: () => void) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => cb());
    } else {
      window.setTimeout(cb, 0);
    }
  };
  ping(() => ping(fn));
}
