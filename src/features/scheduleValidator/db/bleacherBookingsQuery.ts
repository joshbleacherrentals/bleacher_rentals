import { DateTime } from "luxon";
import { db } from "@/components/providers/SystemProvider";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";

/**
 * Overbooked Bleachers: every bleacher in the zone selected on a booked event that runs into the week
 * beginning `weekStart`. The bleacher events table links a bleacher to an event, and the event gives
 * the dates. Narrows by date text with a day to spare; the exact days, in the viewer's own time, are
 * decided by `findOverbookedBleachers`.
 */
export function bleacherBookingsQuery(zoneId: string, weekStart: string) {
  const from = DateTime.fromISO(weekStart, { zone: "utc" }).minus({ days: 1 }).toISODate()!;
  const to = DateTime.fromISO(weekEndOf(weekStart), { zone: "utc" }).plus({ days: 2 }).toISODate()!;
  return db
    .selectFrom("BleacherEvents as be")
    .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
    .innerJoin("Events as e", "e.id", "be.event_uuid")
    .leftJoin("BleacherTypes as bt", "bt.id", "b.bleacher_type_uuid")
    .select([
      "be.bleacher_uuid as bleacher_uuid",
      "b.bleacher_number as bleacher_number",
      "bt.name as bleacher_type_name",
      "be.event_uuid as event_uuid",
      "e.event_name as event_name",
      "e.event_start as event_start",
      "e.event_end as event_end",
    ])
    .where("b.zone_uuid", "=", zoneId)
    .where("b.deleted", "=", 0)
    .where("e.deleted", "=", 0)
    .where("e.event_status", "=", "booked")
    .where("e.event_end", ">=", from)
    .where("e.event_start", "<", to)
    .compile();
}
