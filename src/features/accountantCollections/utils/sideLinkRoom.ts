/**
 * Whether the invoice page has room for Previous Task / Next Task beside its column. The sizes are
 * the design's: a column of 1040 px, and on each side a 168 px rail and a 16 px gap. The room is
 * measured on the page's own box (the area the layout gives the page), not on the window.
 * docs/specs/accountant-collections-22-side-task-buttons.md §1 and §3.
 */
export const COLUMN_WIDTH = 1040;
export const RAIL_WIDTH = 168;
export const RAIL_GAP = 16;
/** 1040 + 2 × (168 + 16) = 1408 px. */
export const MIN_WIDTH_FOR_SIDE_LINKS = COLUMN_WIDTH + 2 * (RAIL_WIDTH + RAIL_GAP);

/** True when the page's box is wide enough; false while it is not measured (`null`). */
export function hasRoomForSideLinks(width: number | null): boolean {
  return width !== null && width >= MIN_WIDTH_FOR_SIDE_LINKS;
}

/** The side buttons are drawn when the view has them (not Customer view) and there is room. */
export function sideLinksShown(enabled: boolean, width: number | null): boolean {
  return enabled && hasRoomForSideLinks(width);
}
