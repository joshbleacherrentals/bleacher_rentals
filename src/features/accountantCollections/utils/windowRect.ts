/**
 * Place and size of the floating New Task window, and the rules that keep it on the screen.
 * Pure, except the two `localStorage` helpers at the end, which never throw (a private window
 * blocks storage). docs/specs/accountant-collections-14-new-task-window.md §3.
 */

export type WindowRect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export type ResizeEdge = "e" | "s" | "se";

/** The design's starting place (top-left corner) and size. */
export const DEFAULT_RECT: WindowRect = { x: 730, y: 250, w: 430, h: 360 };
export const MIN_SIZE: Size = { w: 320, h: 240 };
/** While moving, at least this much of the window's top (the title bar) stays on screen. */
export const KEEP_VISIBLE = 48;

const STORAGE_KEY = "accountantCollections.newTaskWindow";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The whole window inside the screen, at least the minimum size unless the screen is smaller. */
export function clampRect(rect: WindowRect, viewport: Size): WindowRect {
  const w = Math.min(Math.max(rect.w, MIN_SIZE.w), viewport.w);
  const h = Math.min(Math.max(rect.h, MIN_SIZE.h), viewport.h);
  return {
    x: clamp(rect.x, 0, viewport.w - w),
    y: clamp(rect.y, 0, viewport.h - h),
    w,
    h,
  };
}

/**
 * The window dragged by `dx`, `dy` from where the drag began. Left, right and top edges hold; the
 * body may hang off the bottom as long as the top `KEEP_VISIBLE` px stay on screen.
 */
export function moveRect(start: WindowRect, dx: number, dy: number, viewport: Size): WindowRect {
  return {
    ...start,
    x: clamp(start.x + dx, 0, Math.max(0, viewport.w - start.w)),
    y: clamp(start.y + dy, 0, Math.max(0, viewport.h - KEEP_VISIBLE)),
  };
}

/** One dimension: never below the minimum (or the screen, if smaller), never grown past `room`. */
function fit(size: number, delta: number, min: number, room: number): number {
  const upper = Math.max(room, size); // already past the edge: it can shrink, not grow
  return clamp(size + delta, Math.min(min, upper), upper);
}

/** The window with an edge dragged by `dx`, `dy`; the top-left corner never moves. */
export function resizeRect(
  start: WindowRect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  viewport: Size,
): WindowRect {
  return {
    ...start,
    w: edge === "s" ? start.w : fit(start.w, dx, MIN_SIZE.w, viewport.w - start.x),
    h: edge === "e" ? start.h : fit(start.h, dy, MIN_SIZE.h, viewport.h - start.y),
  };
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** What `writeStoredRect` wrote; anything else (garbage, a missing or bad number) gives `null`. */
export function parseStoredRect(raw: string | null): WindowRect | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(w) || !isCoordinate(h)) return null;
  return { x, y, w, h };
}

export function readStoredRect(): WindowRect | null {
  try {
    return parseStoredRect(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredRect(rect: WindowRect): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
  } catch {
    // Storage blocked or full: the window just starts from the defaults next time.
  }
}
