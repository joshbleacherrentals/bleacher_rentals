import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import type { AlertEntityType } from "../types";

/**
 * "Today" for alerts is Toronto's date, whatever clock the code runs on — see
 * docs/specs/no-past-alerts.md. The server cleanup (`delete_past_alerts()`) uses the same zone.
 */
export const BUSINESS_TIMEZONE = "America/Toronto";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const businessDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Toronto, as YYYY-MM-DD. */
export function businessToday(now: Date = new Date()): string {
  return businessDateFormat.format(now);
}

/**
 * A stored date or timestamp as a Toronto YYYY-MM-DD. Plain dates are already calendar days and
 * are returned as-is; timestamps are converted. Null for missing or unreadable input.
 */
export function toBusinessDate(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DATE_ONLY.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return businessDateFormat.format(parsed);
}

/**
 * Whether a day is over. Today is not past — an event that ends today is still on. An unknown date
 * is never treated as past.
 */
export function isPastBusinessDate(
  value: string | null | undefined,
  today: string = businessToday(),
): boolean {
  const date = toBusinessDate(value);
  return date !== null && date < today;
}

/** Drops alerts whose entity date is known and past. */
export function hidePastAlerts<T extends { entityDate: string | null }>(
  rows: T[],
  today: string = businessToday(),
): T[] {
  return rows.filter((row) => !isPastBusinessDate(row.entityDate, today));
}

type DateRow = { date: string | null };

/**
 * The date that decides whether an alert's entity is past: an event's end date, a bleacher event's
 * event end date, or a work tracker's date. Null when the entity is not in the local DB.
 */
export async function getAlertEntityDate(
  entityType: AlertEntityType,
  entityUuid: string,
): Promise<string | null> {
  const query =
    entityType === "event"
      ? db.selectFrom("Events as e").select(["e.event_end as date"]).where("e.id", "=", entityUuid)
      : entityType === "bleacher_event"
        ? db
            .selectFrom("BleacherEvents as be")
            .innerJoin("Events as e", "e.id", "be.event_uuid")
            .select(["e.event_end as date"])
            .where("be.id", "=", entityUuid)
        : db
            .selectFrom("WorkTrackers as wt")
            .select(["wt.date as date"])
            .where("wt.id", "=", entityUuid);

  const rows = await typedGetAll(query.limit(1).compile(), expect<DateRow>());
  return rows[0]?.date ?? null;
}
