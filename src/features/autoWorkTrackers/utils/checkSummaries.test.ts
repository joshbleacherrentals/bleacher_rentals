import { describe, it, expect } from "vitest";
import type { EventDeliveries } from "./deliveryList";
import type { EventBleachers } from "@/features/scheduleValidator/hooks/useEventsBleachers";
import type {
  BleacherBooking,
  OverbookedBleacher,
} from "@/features/scheduleValidator/utils/overbooked";
import type { DriverWorkload } from "@/features/scheduleValidator/utils/driverWorkload";
import type { DriverAvailability } from "@/features/scheduleValidator/utils/driverAvailability";
import {
  summarizeDriverAvailability,
  summarizeDriverWorkload,
  summarizeEventBleacherRequirements,
  summarizeEventFulfilment,
  summarizeOverbookedBleachers,
  summaryTone,
} from "./checkSummaries";

describe("summarizeEventFulfilment", () => {
  it("counts the events with nothing left to deliver", () => {
    const events = [{ toDeliver: 0 }, { toDeliver: 2 }, { toDeliver: 0 }] as EventDeliveries[];
    expect(summarizeEventFulfilment(events)).toEqual({ passed: 2, total: 3 });
  });
});

describe("summarizeEventBleacherRequirements", () => {
  it("counts the events whose bleachers match, treating a missing entry as not matching", () => {
    const byEvent = new Map<string, EventBleachers>([
      ["e1", { matches: true } as EventBleachers],
      ["e2", { matches: false } as EventBleachers],
    ]);
    expect(summarizeEventBleacherRequirements(["e1", "e2", "e3"], byEvent)).toEqual({
      passed: 1,
      total: 3,
    });
  });
});

describe("summarizeOverbookedBleachers", () => {
  it("counts each booked bleacher once, passing those not overbooked", () => {
    const bookings = [
      { bleacherUuid: "b1" },
      { bleacherUuid: "b1" },
      { bleacherUuid: "b2" },
      { bleacherUuid: "b3" },
    ] as BleacherBooking[];
    const overbooked = [{ bleacherUuid: "b1" }] as OverbookedBleacher[];
    expect(summarizeOverbookedBleachers(bookings, overbooked)).toEqual({ passed: 2, total: 3 });
  });
});

describe("summarizeDriverWorkload", () => {
  it("counts the drivers with no day over the limit", () => {
    const drivers = [
      { days: [{ overLimit: false }, { overLimit: false }] },
      { days: [{ overLimit: false }, { overLimit: true }] },
    ] as DriverWorkload[];
    expect(summarizeDriverWorkload(drivers)).toEqual({ passed: 1, total: 2 });
  });
});

describe("summarizeDriverAvailability", () => {
  it("counts the drivers with no conflict", () => {
    const drivers = [{ ok: true }, { ok: false }, { ok: true }] as DriverAvailability[];
    expect(summarizeDriverAvailability(drivers)).toEqual({ passed: 2, total: 3 });
  });
});

describe("summaryTone", () => {
  it("is good when everything passes, including when there is nothing to check", () => {
    expect(summaryTone({ passed: 3, total: 3 })).toBe("good");
    expect(summaryTone({ passed: 0, total: 0 })).toBe("good");
  });

  it("is bad when anything fails", () => {
    expect(summaryTone({ passed: 19, total: 20 })).toBe("bad");
  });
});
