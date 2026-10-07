/**
 * Turns a vertical mouse-wheel tick over a horizontally scrolling row (the
 * applied-filter chips) into the row's next `scrollLeft`.
 *
 * Returns `null` when the browser should keep the event: a horizontal gesture
 * (a trackpad swipe already scrolls the row), or a row that cannot move any
 * further in the direction the wheel points — so the page scrolls on as usual.
 */

/** `WheelEvent.deltaMode`: 0 = pixels, 1 = lines, 2 = pages. */
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** What Firefox's one-notch "3 lines" means in pixels; Chrome and Safari report pixels already. */
const LINE_PX = 16;

type WheelDelta = { deltaX: number; deltaY: number; deltaMode: number };
type Scroller = { scrollLeft: number; scrollWidth: number; clientWidth: number };

export function sidewaysWheelScrollLeft(wheel: WheelDelta, row: Scroller): number | null {
  if (Math.abs(wheel.deltaY) <= Math.abs(wheel.deltaX)) return null;

  const pixels =
    wheel.deltaMode === DOM_DELTA_LINE
      ? wheel.deltaY * LINE_PX
      : wheel.deltaMode === DOM_DELTA_PAGE
        ? wheel.deltaY * row.clientWidth
        : wheel.deltaY;

  const max = row.scrollWidth - row.clientWidth;
  const next = Math.min(max, Math.max(0, row.scrollLeft + pixels));
  return next === row.scrollLeft ? null : next;
}
