/** 预览区四周留白（px），100% 时整页落在窗口内。 */
export const PDF_PAGE_GUTTER = 28;

export function fitPdfScale(
  pageWidth: number,
  pageHeight: number,
  boxWidth: number,
  boxHeight: number,
  gutter = PDF_PAGE_GUTTER,
): number {
  const availW = boxWidth - gutter * 2;
  const availH = boxHeight - gutter * 2;
  if (pageWidth <= 0 || pageHeight <= 0 || availW <= 0 || availH <= 0) return 1;
  return Math.min(availW / pageWidth, availH / pageHeight);
}
