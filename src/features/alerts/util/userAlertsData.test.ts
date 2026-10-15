import { describe, expect, it } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import { buildUserAlertsQueries, mergeUserAlerts, type UserAlertsParts } from "./userAlertsData";

// Spec: docs/specs/slow-local-db-step1-split-watchers.md §3.1 and §5.

const userAlert = (over: Record<string, unknown> = {}) => ({
  id: "ua1",
  alert_uuid: "a1",
  dismissed: 0,
  dismissed_until: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const alert = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  entity_uuid: "ev1",
  entity_type: "event",
  entity_description: "Desc",
  title: "Title",
  message: "Message",
  ...over,
});

const parts = (over: Partial<UserAlertsParts> = {}): UserAlertsParts => ({
  userAlerts: [],
  alerts: [],
  bleacherEvents: [],
  events: [],
  workTrackers: [],
  ...over,
});

describe("mergeUserAlerts", () => {
  it("maps a user alert and its alert to one row", () => {
    const rows = mergeUserAlerts(
      parts({
        userAlerts: [userAlert({ dismissed: 1, dismissed_until: "2026-02-01" })],
        alerts: [alert()],
        events: [{ id: "ev1", event_start: "2026-03-01", event_end: "2026-03-05" }],
      }),
    );

    expect(rows).toEqual([
      {
        userAlertId: "ua1",
        alertId: "a1",
        entityUuid: "ev1",
        entityType: "event",
        entityDescription: "Desc",
        title: "Title",
        message: "Message",
        dismissed: 1,
        dismissedUntil: "2026-02-01",
        createdAt: "2026-01-01T00:00:00Z",
        entityDate: "2026-03-05",
        entityStartDate: "2026-03-01",
      },
    ]);
  });

  it("returns an empty list for empty parts", () => {
    expect(mergeUserAlerts(parts())).toEqual([]);
  });

  describe("rows the inner join dropped", () => {
    it("drops a user alert whose alert is not synced", () => {
      const rows = mergeUserAlerts(
        parts({ userAlerts: [userAlert({ alert_uuid: "a-missing" })], alerts: [alert()] }),
      );
      expect(rows).toEqual([]);
    });

    it("drops a user alert with no alert id", () => {
      const rows = mergeUserAlerts(
        parts({ userAlerts: [userAlert({ alert_uuid: null })], alerts: [alert()] }),
      );
      expect(rows).toEqual([]);
    });

    it("keeps two user alerts that point at one alert", () => {
      const rows = mergeUserAlerts(
        parts({
          userAlerts: [userAlert({ id: "ua1" }), userAlert({ id: "ua2" })],
          alerts: [alert()],
        }),
      );
      expect(rows.map((r) => r.userAlertId).sort()).toEqual(["ua1", "ua2"]);
    });
  });

  describe("entity dates", () => {
    it("takes an event alert's dates from the event", () => {
      const [row] = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "event", entity_uuid: "ev1" })],
          events: [{ id: "ev1", event_start: "2026-03-01", event_end: "2026-03-05" }],
        }),
      );
      expect(row.entityDate).toBe("2026-03-05");
      expect(row.entityStartDate).toBe("2026-03-01");
    });

    it("takes a bleacher event alert's dates from the bleacher event's event", () => {
      const [row] = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "bleacher_event", entity_uuid: "be1" })],
          bleacherEvents: [{ id: "be1", event_uuid: "ev9" }],
          events: [{ id: "ev9", event_start: "2026-04-01", event_end: "2026-04-09" }],
        }),
      );
      expect(row.entityDate).toBe("2026-04-09");
      expect(row.entityStartDate).toBe("2026-04-01");
    });

    it("keeps a bleacher event alert with null dates when the event is not synced", () => {
      const noEventId = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "bleacher_event", entity_uuid: "be1" })],
          bleacherEvents: [{ id: "be1", event_uuid: null }],
        }),
      );
      const eventMissing = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "bleacher_event", entity_uuid: "be1" })],
          bleacherEvents: [{ id: "be1", event_uuid: "ev-missing" }],
        }),
      );
      for (const [row] of [noEventId, eventMissing]) {
        expect(row.entityDate).toBeNull();
        expect(row.entityStartDate).toBeNull();
      }
    });

    it("uses the tracker date for both dates of a work tracker alert", () => {
      const [row] = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "work_tracker", entity_uuid: "wt1" })],
          workTrackers: [{ id: "wt1", date: "2026-05-05" }],
        }),
      );
      expect(row.entityDate).toBe("2026-05-05");
      expect(row.entityStartDate).toBe("2026-05-05");
    });

    it("gives null dates to other and missing entity types, and keeps the alert", () => {
      const rows = mergeUserAlerts(
        parts({
          userAlerts: [
            userAlert({ id: "ua1", alert_uuid: "a1" }),
            userAlert({ id: "ua2", alert_uuid: "a2" }),
          ],
          alerts: [
            alert({ id: "a1", entity_type: "other", entity_uuid: "ev1" }),
            alert({ id: "a2", entity_type: null, entity_uuid: "ev1" }),
          ],
          events: [{ id: "ev1", event_start: "2026-03-01", event_end: "2026-03-05" }],
        }),
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.entityDate).toBeNull();
        expect(row.entityStartDate).toBeNull();
      }
    });

    it("keeps null dates when the entity is not synced, and when its id is null", () => {
      const rows = mergeUserAlerts(
        parts({
          userAlerts: [
            userAlert({ id: "ua1", alert_uuid: "a1" }),
            userAlert({ id: "ua2", alert_uuid: "a2" }),
          ],
          alerts: [
            alert({ id: "a1", entity_type: "event", entity_uuid: "ev-missing" }),
            alert({ id: "a2", entity_type: "event", entity_uuid: null }),
          ],
          events: [{ id: "ev1", event_start: "2026-03-01", event_end: "2026-03-05" }],
        }),
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.entityDate).toBeNull();
    });

    it("does not read an entity of another type that has the same id", () => {
      const [row] = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "event", entity_uuid: "shared-id" })],
          events: [],
          workTrackers: [{ id: "shared-id", date: "2026-05-05" }],
          bleacherEvents: [{ id: "shared-id", event_uuid: "ev9" }],
        }),
      );
      expect(row.entityDate).toBeNull();
      expect(row.entityStartDate).toBeNull();
    });

    it("keeps a null event_end null: the other sources never apply to an event alert", () => {
      const [row] = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "event", entity_uuid: "ev1" })],
          events: [{ id: "ev1", event_start: "2026-03-01", event_end: null }],
        }),
      );
      expect(row.entityDate).toBeNull();
      expect(row.entityStartDate).toBe("2026-03-01");
    });

    it("keeps an empty string date: SQL coalesce skips only NULL", () => {
      const [row] = mergeUserAlerts(
        parts({
          userAlerts: [userAlert()],
          alerts: [alert({ entity_type: "event", entity_uuid: "ev1" })],
          events: [{ id: "ev1", event_start: "", event_end: "" }],
        }),
      );
      expect(row.entityDate).toBe("");
      expect(row.entityStartDate).toBe("");
    });
  });

  describe("order", () => {
    const rowsOf = (userAlerts: ReturnType<typeof userAlert>[]) =>
      mergeUserAlerts(parts({ userAlerts, alerts: [alert()] })).map((r) => r.userAlertId);

    it("sorts by dismissed_until ascending with NULL first, then created_at descending", () => {
      const ids = rowsOf([
        userAlert({ id: "late", dismissed_until: "2026-03-01", created_at: "2026-01-01" }),
        userAlert({ id: "none-old", dismissed_until: null, created_at: "2026-01-01" }),
        userAlert({ id: "early-new", dismissed_until: "2026-02-01", created_at: "2026-01-09" }),
        userAlert({ id: "none-new", dismissed_until: null, created_at: "2026-01-05" }),
        userAlert({ id: "early-old", dismissed_until: "2026-02-01", created_at: "2026-01-02" }),
      ]);
      expect(ids).toEqual(["none-new", "none-old", "early-new", "early-old", "late"]);
    });

    it("puts a NULL created_at last within a group", () => {
      const ids = rowsOf([
        userAlert({ id: "null-created", created_at: null }),
        userAlert({ id: "dated", created_at: "2026-01-01" }),
      ]);
      expect(ids).toEqual(["dated", "null-created"]);
    });

    it("compares as text byte by byte, not with locale rules", () => {
      // Byte order puts "B" (66) before "a" (97); a locale compare would put "a" first.
      // Descending created_at therefore lists "a" before "B".
      const ids = rowsOf([
        userAlert({ id: "upper", created_at: "B" }),
        userAlert({ id: "lower", created_at: "a" }),
      ]);
      expect(ids).toEqual(["lower", "upper"]);
    });
  });
});

describe("buildUserAlertsQueries", () => {
  const compileOnlyDb = new Kysely<PowerSyncDB>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
  });
  const queries = buildUserAlertsQueries(compileOnlyDb, "user-1");

  it("makes five queries, none of them with a JOIN", () => {
    expect(Object.keys(queries).sort()).toEqual([
      "alerts",
      "bleacherEvents",
      "events",
      "userAlerts",
      "workTrackers",
    ]);
    for (const compiled of Object.values(queries)) {
      expect(compiled.sql).not.toMatch(/\bjoin\b/i);
    }
  });

  it("binds every query to the user's id", () => {
    for (const compiled of Object.values(queries)) {
      expect(compiled.parameters).toContain("user-1");
    }
  });

  it("reads each entity table only through the alerts of the user's own alert ids", () => {
    expect(queries.bleacherEvents.parameters).toContain("bleacher_event");
    expect(queries.workTrackers.parameters).toContain("work_tracker");
    expect(queries.events.parameters).toContain("event");
    expect(queries.events.parameters).toContain("bleacher_event");
  });
});
