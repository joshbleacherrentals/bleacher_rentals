import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

import { schedulingConflict } from "./schedulingConflict";
import { eventRequirements } from "./eventRequirements";
import type { AlertPayload, InMemoryAlertContext } from "../types";
import type { PsEventRow } from "@/features/dashboard/db/hooks/powersync/usePsEvents";
import type { PsBleacherEventRow } from "@/features/dashboard/db/hooks/powersync/usePsBleacherEvents";
import type { PsBleacherRow } from "@/features/dashboard/db/hooks/powersync/usePsBleachers";
import type { CurrentEventState } from "@/features/eventConfiguration/state/useCurrentEventStore";

/**
 * These rows are deliberately the shapes `usePsEvents` / `usePsBleacherEvents` /
 * `usePsBleachers` return — narrower and more nullable than `Tables<...>`, with
 * booleans as 0/1. The whole point of the migration is that the definitions read
 * these, so the fixtures must not quietly be the old shape.
 */
const psEvent = (overrides: Partial<PsEventRow> = {}): PsEventRow => ({
  id: "e-other",
  event_name: "Other Event",
  event_start: "2026-05-10",
  event_end: "2026-05-12",
  setup_start: null,
  teardown_end: null,
  hsl_hue: null,
  event_status: "booked",
  goodshuffle_url: null,
  lenient: 0,
  notes: null,
  total_seats: 100,
  seven_row: 0,
  ten_row: 0,
  fifteen_row: 0,
  must_be_clean: 0,
  address_uuid: null,
  created_by_user_uuid: null,
  contract_revenue_cents: null,
  deleted: 0,
  ...overrides,
});

const psBleacherEvent = (overrides: Partial<PsBleacherEventRow> = {}): PsBleacherEventRow => ({
  id: "be-1",
  bleacher_uuid: "b-1",
  event_uuid: "e-other",
  setup_text: null,
  setup_confirmed: 0,
  teardown_text: null,
  teardown_confirmed: 0,
  ...overrides,
});

const psBleacher = (overrides: Partial<PsBleacherRow> = {}): PsBleacherRow => ({
  id: "b-1",
  bleacher_number: 1,
  bleacher_rows: 10,
  bleacher_seats: 100,
  bleacher_type_uuid: "type-a",
  linxup_device_id: null,
  summer_account_manager_uuid: null,
  winter_account_manager_uuid: null,
  summer_home_base_uuid: null,
  winter_home_base_uuid: null,
  zone_uuid: null,
  storage_location_uuid: null,
  ...overrides,
});

const currentEvent = (overrides: Partial<CurrentEventState> = {}): CurrentEventState =>
  ({
    eventUuid: "e-current",
    eventName: "Current Event",
    addressData: null,
    seats: 100,
    sevenRow: 0,
    tenRow: 0,
    fifteenRow: 0,
    bleacherRequirements: [],
    setupStart: "",
    eventStart: "2026-05-11",
    eventEnd: "2026-05-13",
    teardownEnd: "",
    lenient: false,
    selectedStatus: "booked",
    bleacherUuids: ["b-1"],
    alerts: [],
    ...overrides,
  }) as unknown as CurrentEventState;

const context = (overrides: Partial<InMemoryAlertContext> = {}): InMemoryAlertContext => ({
  event: currentEvent(),
  allEvents: [psEvent()],
  allBleacherEvents: [psBleacherEvent()],
  allBleachers: [psBleacher()],
  ...overrides,
});

const runConflict = (ctx: InMemoryAlertContext) => schedulingConflict.evaluateInMemory!(ctx);
const runRequirements = (ctx: InMemoryAlertContext) => eventRequirements.evaluateInMemory!(ctx);

describe("schedulingConflict.evaluateInMemory", () => {
  it("flags an overlap on a shared bleacher", () => {
    const alerts = runConflict(context());

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      title: "Scheduling Conflict",
      entity_type: "event",
      entity_uuid: "e-current",
    });
  });

  it("stays silent when the events do not share a bleacher", () => {
    const ctx = context({
      allBleacherEvents: [psBleacherEvent({ bleacher_uuid: "b-99" })],
    });

    expect(runConflict(ctx)).toEqual([]);
  });

  it("stays silent when the dates do not overlap", () => {
    const ctx = context({
      allEvents: [psEvent({ event_start: "2026-06-01", event_end: "2026-06-02" })],
    });

    expect(runConflict(ctx)).toEqual([]);
  });

  it("ignores the event being edited", () => {
    const ctx = context({
      allEvents: [psEvent({ id: "e-current" })],
      allBleacherEvents: [psBleacherEvent({ event_uuid: "e-current" })],
    });

    expect(runConflict(ctx)).toEqual([]);
  });

  it("only considers booked events on both sides", () => {
    expect(runConflict(context({ allEvents: [psEvent({ event_status: "quoted" })] }))).toEqual([]);
    expect(runConflict(context({ event: currentEvent({ selectedStatus: "quoted" }) }))).toEqual([]);
  });

  it("honours setup and teardown as the true occupied window", () => {
    // The other event's event dates clear ours, but its teardown runs into them.
    const ctx = context({
      allEvents: [
        psEvent({ event_start: "2026-05-05", event_end: "2026-05-08", teardown_end: "2026-05-12" }),
      ],
    });

    expect(runConflict(ctx)).toHaveLength(1);
  });

  it("reports one alert however many events collide", () => {
    const ctx = context({
      allEvents: [psEvent({ id: "e-a" }), psEvent({ id: "e-b" })],
      allBleacherEvents: [
        psBleacherEvent({ id: "be-a", event_uuid: "e-a" }),
        psBleacherEvent({ id: "be-b", event_uuid: "e-b" }),
      ],
    });

    expect(runConflict(ctx)).toHaveLength(1);
  });

  it("is unaffected by a deleted or lost row reaching it", () => {
    // usePsEvents filters both out, so a verdict must never depend on them.
    const withNoise = context({
      allEvents: [
        psEvent(),
        psEvent({ id: "e-del", deleted: 1 }),
        psEvent({ id: "e-lost", event_status: "lost" }),
      ],
      allBleacherEvents: [
        psBleacherEvent(),
        psBleacherEvent({ id: "be-del", event_uuid: "e-del" }),
        psBleacherEvent({ id: "be-lost", event_uuid: "e-lost" }),
      ],
    });

    expect(runConflict(withNoise)).toEqual(runConflict(context()));
  });

  it("tolerates rows with a null event or bleacher reference", () => {
    const ctx = context({
      allBleacherEvents: [
        psBleacherEvent({ id: "be-null-ev", event_uuid: null }),
        psBleacherEvent({ id: "be-null-bl", bleacher_uuid: null }),
        psBleacherEvent(),
      ],
    });

    expect(runConflict(ctx)).toHaveLength(1);
  });
});

describe("eventRequirements.evaluateInMemory", () => {
  it("stays silent when a lenient event's seats match", () => {
    const ctx = context({ event: currentEvent({ lenient: true, seats: 100 }) });

    expect(runRequirements(ctx)).toEqual([]);
  });

  it("reports a seat mismatch on a lenient event", () => {
    const ctx = context({ event: currentEvent({ lenient: true, seats: 150 }) });
    const alerts = runRequirements(ctx);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe("Seat mismatch: 150 required, 100 assigned.");
  });

  it("counts a null seat count as zero rather than poisoning the sum", () => {
    // PowerSync types this column as nullable; `sum + null` used to yield NaN and
    // put "NaN assigned" in front of a manager.
    const ctx = context({
      event: currentEvent({ lenient: true, seats: 150 }),
      allBleachers: [psBleacher({ bleacher_seats: null })],
    });

    expect(runRequirements(ctx)[0].message).toBe("Seat mismatch: 150 required, 0 assigned.");
  });

  it("matches bleacher types against explicit requirements", () => {
    const ctx = context({
      event: currentEvent({
        bleacherRequirements: [{ bleacherTypeUuid: "type-a", quantity: 2 }],
      }),
    });

    expect(runRequirements(ctx)[0].message).toContain("Type: 2 needed, 1 assigned");
  });

  it("falls back to row counts when no explicit requirement is set", () => {
    const ctx = context({ event: currentEvent({ tenRow: 2 }) });

    expect(runRequirements(ctx)[0].message).toContain("10-row: 2 needed, 1 assigned");
  });

  it("stays silent when row counts match", () => {
    const ctx = context({ event: currentEvent({ tenRow: 1 }) });

    expect(runRequirements(ctx)).toEqual([]);
  });

  it("ignores bleachers that are not assigned to this event", () => {
    const ctx = context({
      event: currentEvent({ lenient: true, seats: 100 }),
      allBleachers: [psBleacher(), psBleacher({ id: "b-2", bleacher_seats: 500 })],
    });

    expect(runRequirements(ctx)).toEqual([]);
  });

  it("carries the event description onto the alert", () => {
    const ctx = context({ event: currentEvent({ lenient: true, seats: 150 }) });

    expect(runRequirements(ctx)[0].entity_description).toBe("Current Event");
  });
});

describe("in-memory alert titles", () => {
  // `useEventFormAlerts` derives the titles it owns from `definition.title`, then
  // replaces exactly those in the store. If a definition ever emitted a payload
  // under a different title, its stale alerts would never be cleared — and the
  // form would accumulate warnings that no longer apply.
  it("every payload a definition emits carries that definition's own title", () => {
    const cases: Array<{ title: string; alerts: AlertPayload[] }> = [
      {
        title: schedulingConflict.title,
        alerts: runConflict(context()),
      },
      {
        title: eventRequirements.title,
        alerts: runRequirements(context({ event: currentEvent({ lenient: true, seats: 150 }) })),
      },
    ];

    for (const { title, alerts } of cases) {
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.every((a) => a.title === title)).toBe(true);
    }
  });
});
