import { describe, it, expect } from "vitest";
import { AUTO_WORK_TRACKERS_TABS, DEFAULT_TAB, tabFromPathname, tabHref } from "./tabs";

describe("auto work trackers tabs", () => {
  it("has Schedule first, then Bleacher Deliveries, then Event Dashboard", () => {
    expect(AUTO_WORK_TRACKERS_TABS.map((t) => t.label)).toEqual([
      "Schedule",
      "Bleacher Deliveries",
      "Event Dashboard",
    ]);
    expect(DEFAULT_TAB.slug).toBe("schedule");
  });

  it("finds the tab from the pathname", () => {
    expect(tabFromPathname("/auto-work-trackers/bleacher-deliveries")?.label).toBe(
      "Bleacher Deliveries",
    );
    expect(tabFromPathname("/auto-work-trackers/schedule/")?.slug).toBe("schedule");
  });

  it("finds no tab on the bare page or an unknown one", () => {
    expect(tabFromPathname("/auto-work-trackers")).toBeNull();
    expect(tabFromPathname("/auto-work-trackers/nope")).toBeNull();
  });

  it("puts the zone and week in the tab's address, leaving the zone out when none is chosen", () => {
    const tab = AUTO_WORK_TRACKERS_TABS[1];
    expect(tabHref(tab, "z1", "2026-11-09")).toBe(
      "/auto-work-trackers/bleacher-deliveries?zone=z1&week=2026-11-09",
    );
    expect(tabHref(tab, "", "2026-11-09")).toBe(
      "/auto-work-trackers/bleacher-deliveries?week=2026-11-09",
    );
  });
});
