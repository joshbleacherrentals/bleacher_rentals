/**
 * A driver's week as a 7-day × 24-hour grid: each work tracker painted as spans on its day, the
 * deadhead in (from home or the previous drop-off), the teardown at the pickup, the haul (pickup to
 * drop-off), the setup at the drop-off and, after the day's last trip, the drive home. Each span is
 * as wide as its drive time (or its time on site).
 *
 * Where a span sits: the tracker's planned pickup/drop-off times when it has them (firm). Without
 * them it is an estimate: the day's trips placed one after another from DAY_START, as early as they
 * can be, with default minutes for any drive time not known. Estimated spans are flagged so they can
 * be painted differently. Pure: times are minutes from midnight in the viewer's own zone.
 */

import { DateTime } from "luxon";

export const DAY_MINUTES = 24 * 60;
export const DAY_START = 7 * 60;
export const DEFAULT_HAUL_MINUTES = 120;
export const DEFAULT_DEADHEAD_MINUTES = 60;

export type ScheduleTracker = {
  id: string;
  /** The tracker's day, "YYYY-MM-DD". */
  date: string;
  /** The tracker it drives on from (same driver and day); null: from home. */
  previousId: string | null;
  plannedPickupAt: string | null;
  plannedDropoffAt: string | null;
  haulMinutes: number | null;
  deadheadInMinutes: number | null;
  returnHomeMinutes: number | null;
  /** Time on site at the pickup (a teardown) and at the drop-off (a setup); 0 for none. */
  teardownMinutes: number;
  setupMinutes: number;
  bleacherNumber: number | null;
  pickupLabel: string | null;
  dropoffLabel: string | null;
};

export type SpanKind = "deadhead" | "haul" | "site";

export type ScheduleSpan = {
  trackerId: string;
  kind: SpanKind;
  /** Minutes from midnight, clamped to the day. */
  start: number;
  end: number;
  /** Placed by estimate, not by planned times. */
  estimated: boolean;
  title: string;
};

export type ScheduleDay = {
  date: string;
  spans: ScheduleSpan[];
  trips: number;
  driveMinutes: number;
};

/** "9:05 am". */
export function clock(minutes: number): string {
  return DateTime.fromObject({ hour: 0 })
    .plus({ minutes: Math.round(minutes) })
    .toFormat("h:mm a")
    .toLowerCase();
}

/** "2 h 35 min". */
export function duration(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}

/** A stored timestamp as its local day and minutes from midnight, or null. */
function localTime(value: string | null): { date: string; minutes: number } | null {
  if (!value) return null;
  const t = DateTime.fromISO(value.replace(" ", "T")).toLocal();
  if (!t.isValid) return null;
  return { date: t.toISODate()!, minutes: t.hour * 60 + t.minute };
}

const clamp = (m: number) => Math.min(Math.max(m, 0), DAY_MINUTES);

/** The day a tracker is drawn on: its planned pickup's local day, else its own date. */
export function scheduleDayOf(t: Pick<ScheduleTracker, "date" | "plannedPickupAt">): string {
  return localTime(t.plannedPickupAt)?.date ?? t.date;
}

/** The week's 7 days (Monday first), each with its spans. */
export function layoutSchedule(trackers: ScheduleTracker[], weekStart: string): ScheduleDay[] {
  const days = Array.from(
    { length: 7 },
    (_, i) => DateTime.fromISO(weekStart).plus({ days: i }).toISODate()!,
  );
  const byDay = new Map<string, ScheduleTracker[]>(days.map((d) => [d, []]));
  for (const t of trackers) {
    byDay.get(scheduleDayOf(t))?.push(t);
  }

  return days.map((date) => {
    const list = byDay.get(date)!;
    const ids = new Set(list.map((t) => t.id));
    const depth = (t: ScheduleTracker, seen = new Set<string>()): number => {
      if (!t.previousId || !ids.has(t.previousId) || seen.has(t.id)) return 0;
      seen.add(t.id);
      return 1 + depth(list.find((x) => x.id === t.previousId)!, seen);
    };
    const followed = new Set(list.map((t) => t.previousId).filter((id) => id && ids.has(id)));
    const ordered = [...list].sort((a, b) => {
      const pa = localTime(a.plannedPickupAt)?.minutes ?? Number.MAX_SAFE_INTEGER;
      const pb = localTime(b.plannedPickupAt)?.minutes ?? Number.MAX_SAFE_INTEGER;
      return pa - pb || depth(a) - depth(b) || a.id.localeCompare(b.id);
    });

    const spans: ScheduleSpan[] = [];
    let cursor = DAY_START;
    let driveMinutes = 0;
    for (const t of ordered) {
      const pickup = localTime(t.plannedPickupAt);
      const dropoff = localTime(t.plannedDropoffAt);
      const estimated = !pickup;
      const fromPrevious = !!t.previousId && ids.has(t.previousId);
      const deadIn =
        t.deadheadInMinutes ?? (estimated ? (fromPrevious ? 0 : DEFAULT_DEADHEAD_MINUTES) : 0);
      // The planned pickup is the arrival there; the haul starts after the teardown.
      const start = pickup ? pickup.minutes : cursor + deadIn;
      const haulStart = start + t.teardownMinutes;
      const haul = t.haulMinutes ?? (pickup && dropoff ? dropoff.minutes - haulStart : null);
      const end = dropoff && pickup ? dropoff.minutes : haulStart + (haul ?? DEFAULT_HAUL_MINUTES);
      const leave = end + t.setupMinutes;
      const returns = !followed.has(t.id);
      const home = returns
        ? (t.returnHomeMinutes ?? (estimated ? DEFAULT_DEADHEAD_MINUTES : 0))
        : 0;

      const trip = `#${t.bleacherNumber ?? "?"}`;
      const where = [t.pickupLabel, t.dropoffLabel].filter(Boolean).join(" → ");
      const note = estimated ? " (estimated: no planned times)" : "";
      const add = (kind: SpanKind, from: number, to: number, what: string) => {
        if (to - from <= 0) return;
        spans.push({
          trackerId: t.id,
          kind,
          start: clamp(from),
          end: clamp(to),
          estimated,
          title: `${trip} · ${what} · ${clock(from)}–${clock(to)} (${duration(to - from)})${
            where && kind === "haul" ? ` · ${where}` : ""
          }${note}`,
        });
      };
      add(
        "deadhead",
        start - deadIn,
        start,
        fromPrevious ? "Deadhead from last drop-off" : "Deadhead from home",
      );
      add("site", start, haulStart, "Teardown");
      add("haul", haulStart, end, "Haul");
      add("site", end, leave, "Setup");
      add("deadhead", leave, leave + home, "Deadhead home");

      driveMinutes += deadIn + (end - haulStart) + home;
      cursor = leave + home;
    }
    return { date, spans, trips: list.length, driveMinutes };
  });
}
