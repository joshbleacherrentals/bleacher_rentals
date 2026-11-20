import { describe, it, expect } from "vitest";
import {
  AUTO_WORK_TRACKERS_PAGES,
  AUTO_WORK_TRACKERS_SECTIONS,
  DEFAULT_PAGE,
  pageFromPathname,
  pageHref,
} from "./pages";

describe("auto work trackers pages", () => {
  it("groups the pages under Events, Bleachers and Drivers", () => {
    expect(AUTO_WORK_TRACKERS_SECTIONS.map((s) => [s.label, s.pages.map((p) => p.slug)])).toEqual([
      ["Events", ["event-dashboard", "event-fulfilment", "event-bleacher-requirements"]],
      ["Bleachers", ["overbooked-bleachers"]],
      ["Drivers", ["driver-workload", "driver-availability"]],
    ]);
  });

  it("opens on the Event Dashboard", () => {
    expect(DEFAULT_PAGE.slug).toBe("event-dashboard");
  });

  it("has no Schedule page and no two pages share a slug", () => {
    const slugs = AUTO_WORK_TRACKERS_PAGES.map((p) => p.slug);
    expect(slugs).not.toContain("schedule");
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("finds the page from the pathname", () => {
    expect(pageFromPathname("/auto-work-trackers/event-fulfilment")?.label).toBe(
      "Event Fulfilment",
    );
    expect(pageFromPathname("/auto-work-trackers/driver-workload/")?.slug).toBe("driver-workload");
  });

  it("finds no page on the bare page or an unknown one", () => {
    expect(pageFromPathname("/auto-work-trackers")).toBeNull();
    expect(pageFromPathname("/auto-work-trackers/schedule")).toBeNull();
  });

  it("puts the zone and week in the page's address, leaving the zone out when none is chosen", () => {
    const page = AUTO_WORK_TRACKERS_PAGES[1];
    expect(pageHref(page, "z1", "2026-11-09")).toBe(
      "/auto-work-trackers/event-fulfilment?zone=z1&week=2026-11-09",
    );
    expect(pageHref(page, "", "2026-11-09")).toBe(
      "/auto-work-trackers/event-fulfilment?week=2026-11-09",
    );
  });
});
