import { describe, it, expect } from "vitest";
import type { EventLogisticsCheck } from "@/features/scheduleValidator/utils/logisticsPlan";
import { zoneWeekEvents } from "./zoneEvents";

describe("zoneWeekEvents", () => {
  it("lists the zone's events by id and name, in the order given", () => {
    const events = [
      { eventId: "e2", eventName: "Fair", bleachers: [{}] },
      { eventId: "e1", eventName: "Rodeo", bleachers: [{}] },
    ] as EventLogisticsCheck[];
    expect(zoneWeekEvents(events)).toEqual([
      { id: "e2", name: "Fair" },
      { id: "e1", name: "Rodeo" },
    ]);
  });

  it("is empty when no event has a bleacher from the zone", () => {
    expect(zoneWeekEvents([])).toEqual([]);
  });
});
