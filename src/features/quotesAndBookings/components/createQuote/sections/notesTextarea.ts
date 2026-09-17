/**
 * Drag-to-resize, vertically only. The smallest it goes is the old fixed three-line box (3 x 20px
 * lines + 16px padding + 2px border = 78px), and it stops at six times that so a long note cannot
 * swallow the page. Kept as literal classes: Tailwind only generates what it can read in source.
 */
export const NOTES_MIN_HEIGHT_PX = 78;
export const NOTES_MAX_HEIGHT_PX = 468;
export const NOTES_TEXTAREA_CLASS =
  "w-full h-[78px] min-h-[78px] max-h-[468px] px-3 py-2 border rounded text-sm resize-y";
