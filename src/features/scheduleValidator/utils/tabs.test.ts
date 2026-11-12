import { describe, it, expect } from "vitest";
import { DEFAULT_TAB, SCHEDULE_VALIDATOR_TABS, tabFromPathname, tabHref } from "./tabs";

describe("schedule validator tabs", () => {
  it("has Event Bleacher Requirements, Overbooked Bleachers, Bleacher Deliveries, Driver Availability, then Driver Workload", () => {
    expect(SCHEDULE_VALIDATOR_TABS.map((t) => t.label)).toEqual([
      "Event Bleacher Requirements",
      "Overbooked Bleachers",
      "Bleacher Deliveries",
      "Driver Availability",
      "Driver Workload",
    ]);
    expect(DEFAULT_TAB.slug).toBe("event-bleacher-requirements");
  });

  it("finds the tab from the pathname", () => {
    expect(tabFromPathname("/schedule-validator/overbooked-bleachers")?.label).toBe(
      "Overbooked Bleachers",
    );
    expect(tabFromPathname("/schedule-validator/event-bleacher-requirements/")?.slug).toBe(
      "event-bleacher-requirements",
    );
  });

  it("finds no tab on the bare page or an unknown one", () => {
    expect(tabFromPathname("/schedule-validator")).toBeNull();
    expect(tabFromPathname("/schedule-validator/nope")).toBeNull();
  });

  it("puts the week in the tab's address", () => {
    expect(tabHref(SCHEDULE_VALIDATOR_TABS[1], "2026-11-09")).toBe(
      "/schedule-validator/overbooked-bleachers?week=2026-11-09",
    );
  });
});
