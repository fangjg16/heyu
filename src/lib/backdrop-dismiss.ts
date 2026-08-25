import type { MouseEvent, PointerEvent } from "react";

const ATTR = "data-backdrop-down";

/** 记录按下是否落在遮罩本身，避免输入框拖选松手到遮罩时误关浮窗 */
export function markBackdropPointerDown(e: PointerEvent<HTMLElement>) {
  e.currentTarget.setAttribute(
    ATTR,
    e.target === e.currentTarget ? "1" : "0",
  );
}

export function dismissIfBackdropClick(
  e: MouseEvent<HTMLElement>,
  onDismiss: () => void,
  enabled = true,
) {
  const startedOnBackdrop = e.currentTarget.getAttribute(ATTR) === "1";
  e.currentTarget.removeAttribute(ATTR);
  if (enabled && e.target === e.currentTarget && startedOnBackdrop) {
    onDismiss();
  }
}
