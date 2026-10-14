import type { Kysely } from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import type { UserAlertRow } from "../hooks/useUserAlerts";

/**
 * The data behind `useUserAlerts`, as five small queries and a JS merge instead of one query with
 * five JOINs. Spec: docs/specs/slow-local-db-step1-split-watchers.md.
 *
 * Why: the single query returned thousands of wide rows for a large user and re-ran on every
 * commit to any of its five tables. Each small query reads one table, so a commit to `Events`
 * re-runs only the `Events` query and the join is redone here, in memory.
 *
 * The rows the merge returns are exactly the rows the old query returned (same rows, same
 * columns, same order); `userAlertsData.differential.test.ts` checks that against the old SQL.
 *
 * This module never imports `SystemProvider`, so it runs in Node tests: the builders take the
 * Kysely instance as a parameter.
 */

export type UserAlertPart = {
  id: string;
  alert_uuid: string | null;
  dismissed: number | null;
  dismissed_until: string | null;
  created_at: string | null;
};

export type AlertPart = {
  id: string;
  entity_uuid: string | null;
  entity_type: string | null;
  entity_description: string | null;
  title: string | null;
  message: string | null;
};

export type BleacherEventPart = {
  id: string;
  event_uuid: string | null;
};

export type EventDatesPart = {
  id: string;
  event_start: string | null;
  event_end: string | null;
};

export type WorkTrackerPart = {
  id: string;
  date: string | null;
};

export type UserAlertsParts = {
  userAlerts: UserAlertPart[];
  alerts: AlertPart[];
  bleacherEvents: BleacherEventPart[];
  events: EventDatesPart[];
  workTrackers: WorkTrackerPart[];
};

/**
 * The five small queries for one user. Every one is bound to the user's id, directly or through
 * the subquery of the user's own alert ids (`mine`), so none of them reads another user's rows.
 * There is no JOIN: the related tables are selected with `where id in (subquery)`.
 */
export function buildUserAlertsQueries(db: Kysely<PowerSyncDB>, userUuid: string) {
  /** The ids of the user's own alerts. */
  const mine = () =>
    db.selectFrom("UserAlerts as ua").select("ua.alert_uuid").where("ua.user_uuid", "=", userUuid);

  /** The entity ids of the user's alerts of one entity type. */
  const entityIdsOf = (entityType: string) =>
    db
      .selectFrom("Alerts as a")
      .select("a.entity_uuid")
      .where("a.entity_type", "=", entityType)
      .where("a.id", "in", mine());

  return {
    userAlerts: db
      .selectFrom("UserAlerts as ua")
      .select(["ua.id", "ua.alert_uuid", "ua.dismissed", "ua.dismissed_until", "ua.created_at"])
      .where("ua.user_uuid", "=", userUuid)
      .compile(),

    alerts: db
      .selectFrom("Alerts as a")
      .select([
        "a.id",
        "a.entity_uuid",
        "a.entity_type",
        "a.entity_description",
        "a.title",
        "a.message",
      ])
      .where("a.id", "in", mine())
      .compile(),

    bleacherEvents: db
      .selectFrom("BleacherEvents as be")
      .select(["be.id", "be.event_uuid"])
      .where("be.id", "in", entityIdsOf("bleacher_event"))
      .compile(),

    // The alert's own event, and the event of the alert's bleacher event.
    events: db
      .selectFrom("Events as e")
      .select(["e.id", "e.event_start", "e.event_end"])
      .where((eb) =>
        eb.or([
          eb("e.id", "in", entityIdsOf("event")),
          eb(
            "e.id",
            "in",
            db
              .selectFrom("BleacherEvents as be")
              .select("be.event_uuid")
              .where("be.id", "in", entityIdsOf("bleacher_event")),
          ),
        ]),
      )
      .compile(),

    workTrackers: db
      .selectFrom("WorkTrackers as wt")
      .select(["wt.id", "wt.date"])
      .where("wt.id", "in", entityIdsOf("work_tracker"))
      .compile(),
  };
}

/** Ascending with NULL first, the order SQLite gives; text is compared byte by byte. */
function compareNullsFirst(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return byId;
}

/**
 * Joins the five parts into the rows the old query returned:
 *
 * - a user alert whose alert is not synced is dropped (the old inner join);
 * - the alert's entity is looked up by its type only, so a bleacher event or a work tracker with
 *   the same id as an event is never read for an event alert;
 * - `entityDate` and `entityStartDate` are the first non-null of the event, the bleacher event's
 *   event and the work tracker (the old `coalesce`), null when the entity is not synced locally;
 * - rows are ordered by `dismissed_until` ascending (NULL first), then `created_at` descending
 *   (NULL last). Rows that tie on both are in no defined order, as before.
 */
export function mergeUserAlerts(parts: UserAlertsParts): UserAlertRow[] {
  const alertById = indexById(parts.alerts);
  const bleacherEventById = indexById(parts.bleacherEvents);
  const eventById = indexById(parts.events);
  const workTrackerById = indexById(parts.workTrackers);

  const rows: UserAlertRow[] = [];

  for (const userAlert of parts.userAlerts) {
    const alert = userAlert.alert_uuid === null ? undefined : alertById.get(userAlert.alert_uuid);
    if (!alert) continue;

    const entityId = alert.entity_uuid;
    const event =
      alert.entity_type === "event" && entityId !== null ? eventById.get(entityId) : undefined;
    const bleacherEvent =
      alert.entity_type === "bleacher_event" && entityId !== null
        ? bleacherEventById.get(entityId)
        : undefined;
    const bleacherEventsEvent =
      bleacherEvent && bleacherEvent.event_uuid !== null
        ? eventById.get(bleacherEvent.event_uuid)
        : undefined;
    const workTracker =
      alert.entity_type === "work_tracker" && entityId !== null
        ? workTrackerById.get(entityId)
        : undefined;

    rows.push({
      userAlertId: userAlert.id,
      alertId: alert.id,
      entityUuid: alert.entity_uuid,
      entityType: alert.entity_type,
      entityDescription: alert.entity_description,
      title: alert.title,
      message: alert.message,
      dismissed: userAlert.dismissed,
      dismissedUntil: userAlert.dismissed_until,
      createdAt: userAlert.created_at,
      entityDate: event?.event_end ?? bleacherEventsEvent?.event_end ?? workTracker?.date ?? null,
      entityStartDate:
        event?.event_start ?? bleacherEventsEvent?.event_start ?? workTracker?.date ?? null,
    });
  }

  return rows.sort(
    (x, y) =>
      compareNullsFirst(x.dismissedUntil, y.dismissedUntil) ||
      compareNullsFirst(y.createdAt, x.createdAt),
  );
}
