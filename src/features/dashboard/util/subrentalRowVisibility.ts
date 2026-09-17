import { Bleacher } from "../types";

/**
 * How many days before a subrental starts (and after it ends) its row stays on screen.
 */
export const SUBRENTAL_ROW_PADDING_DAYS = 14;

type DateRange = { eventStart: string; eventEnd: string };

/** Shifts a YYYY-MM-DD string by `days`, keeping the same format. */
function shiftDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** All subrental windows on a row — pending ones plus the accepted ranges. */
function subrentalRanges(bleacher: Bleacher): DateRange[] {
  return [...bleacher.subrentalEvents, ...(bleacher.acceptedSubrentalAccess ?? [])];
}

/**
 * A subrental ("ghost") row is only shown while the visible date window comes within
 * {@link SUBRENTAL_ROW_PADDING_DAYS} of one of its subrentals — so the row appears two weeks
 * before the subrental starts, stays for its whole duration however long that is, and drops out
 * two weeks after it ends. Normal rows are never affected.
 *
 * `visibleStart` / `visibleEnd` are the first and last dates currently on screen (YYYY-MM-DD).
 */
export function isSubrentalRowVisible(
  bleacher: Bleacher,
  visibleStart: string,
  visibleEnd: string,
): boolean {
  if (!bleacher.isSubrentalRow) return true;

  return subrentalRanges(bleacher).some((range) => {
    const start = range.eventStart?.substring(0, 10);
    const end = range.eventEnd?.substring(0, 10);
    if (!start || !end) return false;

    const paddedStart = shiftDays(start, -SUBRENTAL_ROW_PADDING_DAYS);
    const paddedEnd = shiftDays(end, SUBRENTAL_ROW_PADDING_DAYS);
    return paddedStart <= visibleEnd && paddedEnd >= visibleStart;
  });
}

/**
 * Drops the subrental rows that are too far from the visible date window, preserving the order of
 * the rows that stay. When the window is unknown (no dates yet) the list is returned untouched.
 *
 * `alwaysKeepBleacherUuids` holds the bleachers pinned by an open form — their rows stay whatever
 * the scroll position is, so a subrental being created never disappears under the user.
 */
export function filterSubrentalRowsByDateWindow(
  bleachers: Bleacher[],
  visibleStart: string | undefined,
  visibleEnd: string | undefined,
  alwaysKeepBleacherUuids?: ReadonlySet<string>,
): Bleacher[] {
  if (!visibleStart || !visibleEnd) return bleachers;
  return bleachers.filter(
    (b) =>
      alwaysKeepBleacherUuids?.has(b.bleacherUuid) ||
      isSubrentalRowVisible(b, visibleStart, visibleEnd),
  );
}
