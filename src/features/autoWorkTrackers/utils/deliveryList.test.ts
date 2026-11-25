import { describe, it, expect } from "vitest";
import type {
  EventLogisticsCheck,
  BleacherCheck,
} from "@/features/scheduleValidator/utils/logisticsPlan";
import { buildDeliveryList } from "./deliveryList";

const bleacher = (overrides: Partial<BleacherCheck> = {}): BleacherCheck => ({
  bleacherUuid: "b1",
  bleacherNumber: 1,
  bleacherTypeName: "7 Row",
  last: {
    kind: "event",
    id: "prev",
    date: "2026-11-07",
    street: "2 Oak Ave",
    latitude: 51.0,
    longitude: -114.0,
    label: "Earlier Event",
  },
  matches: false,
  ...overrides,
});

const event = (
  bleachers: BleacherCheck[],
  overrides: Partial<EventLogisticsCheck> = {},
): EventLogisticsCheck => ({
  eventId: "e1",
  eventName: "The Event",
  startDate: "2026-11-13",
  street: "9 Here St",
  latitude: 53.5,
  longitude: -113.5,
  bleachers,
  ...overrides,
});

describe("buildDeliveryList", () => {
  it("keeps every bleacher, the ones to deliver first and the ready ones after", () => {
    const [e] = buildDeliveryList([
      event([
        bleacher({ bleacherUuid: "ok", bleacherNumber: 1, matches: true }),
        bleacher({ bleacherUuid: "needs", bleacherNumber: 2 }),
      ]),
    ]);
    expect(e.bleachers.map((b) => [b.bleacherUuid, b.ready])).toEqual([
      ["needs", false],
      ["ok", true],
    ]);
    expect(e.toDeliver).toBe(1);
    expect(e.allReady).toBe(false);
  });

  it("marks an event whose bleachers are all in place as ready, and lists it after the others", () => {
    const list = buildDeliveryList([
      event([bleacher({ matches: true })], { eventId: "done" }),
      event([bleacher()], { eventId: "todo" }),
    ]);
    expect(list.map((e) => e.eventId)).toEqual(["todo", "done"]);
    expect(list[1]).toMatchObject({ allReady: true, toDeliver: 0 });
  });

  it("does not call an event with no bleachers ready", () => {
    const [e] = buildDeliveryList([event([])]);
    expect(e).toMatchObject({ allReady: false, toDeliver: 0 });
  });

  it("gives a ready bleacher no days or distance", () => {
    const [{ bleachers }] = buildDeliveryList([event([bleacher({ matches: true })])]);
    expect(bleachers[0]).toMatchObject({ daysAvailable: null, distanceKm: null });
  });

  it("counts the days between the last location and the event start", () => {
    const [{ bleachers }] = buildDeliveryList([event([bleacher()])]);
    expect(bleachers[0].daysAvailable).toBe(6); // Nov 7 to Nov 13
  });

  it("says zero days when the bleacher was last somewhere the day the event starts", () => {
    const last = { ...bleacher().last!, date: "2026-11-13" };
    const [{ bleachers }] = buildDeliveryList([event([bleacher({ last })])]);
    expect(bleachers[0].daysAvailable).toBe(0);
  });

  it("measures the straight-line distance from the last location to the event", () => {
    const [{ bleachers }] = buildDeliveryList([event([bleacher()])]);
    expect(bleachers[0].distanceKm).toBeGreaterThan(250);
    expect(bleachers[0].distanceKm).toBeLessThan(300);
  });

  it("has no distance when either end has no coordinates", () => {
    const noCoords = { ...bleacher().last!, latitude: null, longitude: null };
    const [a] = buildDeliveryList([event([bleacher({ last: noCoords })])]);
    expect(a.bleachers[0].distanceKm).toBeNull();
    const [b] = buildDeliveryList([event([bleacher()], { latitude: null })]);
    expect(b.bleachers[0].distanceKm).toBeNull();
  });

  it("has neither days nor distance for a bleacher with no known location", () => {
    const [{ bleachers }] = buildDeliveryList([event([bleacher({ last: null })])]);
    expect(bleachers[0]).toMatchObject({ daysAvailable: null, distanceKm: null });
  });

  it("lists no-known-location first, then the least time available, then bleacher number", () => {
    const at = (date: string) => ({ ...bleacher().last!, date });
    const [{ bleachers }] = buildDeliveryList([
      event([
        bleacher({ bleacherUuid: "late", bleacherNumber: 5, last: at("2026-11-12") }),
        bleacher({ bleacherUuid: "early", bleacherNumber: 1, last: at("2026-11-01") }),
        bleacher({ bleacherUuid: "none", bleacherNumber: 9, last: null }),
        bleacher({ bleacherUuid: "tie", bleacherNumber: 2, last: at("2026-11-12") }),
      ]),
    ]);
    expect(bleachers.map((b) => b.bleacherUuid)).toEqual(["none", "tie", "late", "early"]);
  });

  it("keeps the events needing deliveries in the order given", () => {
    const list = buildDeliveryList([
      event([bleacher()], { eventId: "a" }),
      event([bleacher()], { eventId: "b" }),
    ]);
    expect(list.map((e) => e.eventId)).toEqual(["a", "b"]);
  });
});
