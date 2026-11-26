import { describe, it, expect } from "vitest";
import {
  AREAS,
  areaHref,
  areaPages,
  driverScheduleHref,
  legacyAutoWorkTrackersHref,
  locatePage,
  pageHref,
  scheduleBackHref,
} from "./pages";

const slugsBySection = (key: keyof typeof AREAS) =>
  AREAS[key].sections.map((s) => [s.label, s.pages.map((p) => p.slug)]);

describe("planning tabs", () => {
  it("Verify opens on the Dashboard and lists how good the plan is", () => {
    expect(AREAS.check.home.slug).toBe("dashboard");
    expect(slugsBySection("check")).toEqual([
      [
        "",
        [
          "event-fulfilment",
          "event-bleacher-requirements",
          "overbooked-bleachers",
          "driver-workload",
          "driver-availability",
          "delivery-proof",
        ],
      ],
    ]);
  });

  it("Auto Generate opens on Generate and lists what the model needs, then its runs", () => {
    expect(AREAS.auto.home).toMatchObject({ slug: "", label: "Generate" });
    // One list with no heading: too few pages for headings.
    expect(slugsBySection("auto")).toEqual([
      ["", ["driver-data", "event-data", "bleacher-data", "model-runs"]],
    ]);
  });

  it("lists every page in one tab only", () => {
    const check = areaPages(AREAS.check).map((p) => p.slug);
    for (const page of areaPages(AREAS.auto)) expect(check).not.toContain(page.slug);
  });

  it("gives every listed page a tagline, and every page under a title a description", () => {
    for (const area of Object.values(AREAS)) {
      for (const page of areaPages(area)) {
        expect(page.tagline, `${area.key}/${page.slug}`).toBeTruthy();
      }
      for (const page of area.sections.flatMap((s) => s.pages)) {
        expect(page.description, `${area.key}/${page.slug}`).toBeTruthy();
      }
    }
    expect(AREAS.check.home.description).toBeTruthy();
  });

  it("has no two pages in a tab sharing a slug", () => {
    for (const area of Object.values(AREAS)) {
      const slugs = areaPages(area).map((p) => p.slug);
      expect(new Set(slugs).size, area.key).toBe(slugs.length);
    }
  });

  it("finds the tab and page from the pathname", () => {
    expect(locatePage("/work-trackers/auto-generate/event-data")?.page?.label).toBe("Event Data");
    expect(locatePage("/work-trackers/verify/event-data")?.page).toBeNull();
    expect(locatePage("/work-trackers/auto-generate")?.page?.label).toBe("Generate");
    expect(locatePage("/work-trackers/auto-generate/driver-data/")?.page?.label).toBe(
      "Driver Data",
    );
    expect(locatePage("/work-trackers/verify/delivery-proof")?.page?.label).toBe(
      "Proof of Delivery",
    );
    expect(locatePage("/work-trackers/auto-generate/driver-schedule")?.page?.label).toBe(
      "Driver Schedule",
    );
  });

  it("finds no tab on the weeks pages and no page on an unknown slug", () => {
    expect(locatePage("/work-trackers")).toBeNull();
    expect(locatePage("/work-trackers/2026-11-23/u1")).toBeNull();
    expect(locatePage("/work-trackers/verify/nope")?.page).toBeNull();
  });

  it("puts the zone and week in the address, leaving the zone out when none is chosen", () => {
    const page = AREAS.check.sections[0].pages[0];
    expect(pageHref(AREAS.check, page, "z1", "2026-11-09")).toBe(
      "/work-trackers/verify/event-fulfilment?zone=z1&week=2026-11-09",
    );
    expect(pageHref(AREAS.check, page, "", "2026-11-09")).toBe(
      "/work-trackers/verify/event-fulfilment?week=2026-11-09",
    );
    expect(areaHref(AREAS.auto, "z1", "2026-11-09")).toBe(
      "/work-trackers/auto-generate?zone=z1&week=2026-11-09",
    );
  });
});

describe("driver schedule", () => {
  it("opens in the tab it came from, keeping the zone, week, driver and page", () => {
    expect(driverScheduleHref(AREAS.check, "u1", "z1", "2026-09-14", "driver-workload")).toBe(
      "/work-trackers/verify/driver-schedule?zone=z1&week=2026-09-14&user=u1&from=driver-workload",
    );
  });

  it("goes back to the page it came from, or the tab's home", () => {
    expect(scheduleBackHref(AREAS.check, "driver-availability", "z1", "2026-09-14")).toBe(
      "/work-trackers/verify/driver-availability?zone=z1&week=2026-09-14",
    );
    expect(scheduleBackHref(AREAS.check, null, "z1", "2026-09-14")).toBe(
      "/work-trackers/verify/dashboard?zone=z1&week=2026-09-14",
    );
    expect(scheduleBackHref(AREAS.auto, "driver-schedule", "z1", "2026-09-14")).toBe(
      "/work-trackers/auto-generate?zone=z1&week=2026-09-14",
    );
  });
});

describe("old Auto Work Trackers links", () => {
  it("land in the tab that lists the page, keeping the query", () => {
    expect(legacyAutoWorkTrackersHref(undefined, "")).toBe("/work-trackers/auto-generate");
    expect(legacyAutoWorkTrackersHref("event-data", "zone=z1&week=2026-11-23")).toBe(
      "/work-trackers/auto-generate/event-data?zone=z1&week=2026-11-23",
    );
    expect(legacyAutoWorkTrackersHref("driver-workload", "zone=z1")).toBe(
      "/work-trackers/verify/driver-workload?zone=z1",
    );
    expect(legacyAutoWorkTrackersHref("dashboard", "")).toBe("/work-trackers/verify/dashboard");
    expect(legacyAutoWorkTrackersHref("delivery-proof", "?zone=z1")).toBe(
      "/work-trackers/verify/delivery-proof?zone=z1",
    );
    expect(legacyAutoWorkTrackersHref("unknown", "")).toBe("/work-trackers/auto-generate");
  });
});
