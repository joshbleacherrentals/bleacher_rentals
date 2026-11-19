import { describe, expect, it } from "vitest";
import {
  buildDamageReportViews,
  findService,
  repairLabel,
  reportsButtonLabel,
  reportsWindowTitle,
  serviceRowLabel,
  serviceWindowTitle,
} from "./repairDetails";
import { repairRow, repairService as service } from "./repairRowFixture";
import type { RawReportDetailRow, RawReportPhotoRow } from "../db/serviceWindowQueries";

// docs/specs/repairs-06-expanded-row.md §2.2 to §2.4, §3 and §7.

describe("findService", () => {
  const welding = service({ id: "s1" });
  const jacks = service({ id: "s2", categoryName: "Jacks" });
  const rows = [
    repairRow({ id: "r1", services: [welding, jacks] }),
    repairRow({ id: "r2", services: [service({ id: "s3" })] }),
  ];

  it("finds the repair and the service of a reference", () => {
    const found = findService(rows, { repairId: "r1", serviceId: "s2" });
    expect(found?.repair.id).toBe("r1");
    expect(found?.service).toBe(jacks);
  });

  it("gives null for a missing repair, a missing service and no reference", () => {
    expect(findService(rows, { repairId: "nope", serviceId: "s1" })).toBeNull();
    expect(findService(rows, { repairId: "r1", serviceId: "nope" })).toBeNull();
    expect(findService(rows, { repairId: "r2", serviceId: "s1" })).toBeNull();
    expect(findService(rows, null)).toBeNull();
  });
});

describe("repairLabel", () => {
  it("names the repair by its invoice number", () => {
    expect(repairLabel(repairRow({ id: "r", invoiceNumber: "JJ-5" }))).toBe("repair JJ-5");
  });

  it("names it by its bleachers when there is no invoice number, #? for an unknown number", () => {
    const row = repairRow({
      id: "r",
      bleachers: [
        { uuid: "b1", number: 52 },
        { uuid: "b2", number: null },
      ],
    });
    expect(repairLabel(row)).toBe("repair of bleacher #52, #?");
  });

  it("is just repair when it has neither", () => {
    expect(repairLabel(repairRow({ id: "r" }))).toBe("repair");
    expect(repairLabel(repairRow({ id: "r", invoiceNumber: "   " }))).toBe("repair");
  });
});

describe("serviceRowLabel and serviceWindowTitle", () => {
  it("write the bleacher and the category", () => {
    const s = service({ id: "s" });
    expect(serviceRowLabel(s)).toBe("Open service: bleacher 26, Welding");
    expect(serviceWindowTitle(s)).toBe("Welding · Bleacher #26");
  });

  it("leave the category out when there is none", () => {
    const s = service({ id: "s", categoryName: null, damageCategoryUuid: null });
    expect(serviceRowLabel(s)).toBe("Open service: bleacher 26");
    expect(serviceWindowTitle(s)).toBe("Bleacher #26");
    expect(serviceWindowTitle(service({ id: "s", categoryName: "" }))).toBe("Bleacher #26");
  });

  it("write ? for a bleacher whose number is unknown", () => {
    const s = service({ id: "s", bleacherNumber: null });
    expect(serviceRowLabel(s)).toBe("Open service: bleacher ?, Welding");
    expect(serviceWindowTitle(s)).toBe("Welding · Bleacher #?");
    expect(serviceWindowTitle(service({ id: "s", bleacherNumber: null, categoryName: null }))).toBe(
      "Bleacher #?",
    );
  });
});

describe("reportsButtonLabel and reportsWindowTitle (D92)", () => {
  it("has no button when no report was found", () => {
    expect(reportsButtonLabel(0)).toBeNull();
  });

  it("reads View Damage Report for one and View Damage Reports (N) for several", () => {
    expect(reportsButtonLabel(1)).toBe("View Damage Report");
    expect(reportsButtonLabel(2)).toBe("View Damage Reports (2)");
    expect(reportsButtonLabel(3)).toBe("View Damage Reports (3)");
  });

  it("titles the window Damage report for one and Damage reports (N) for several", () => {
    expect(reportsWindowTitle(1)).toBe("Damage report");
    expect(reportsWindowTitle(0)).toBe("Damage report");
    expect(reportsWindowTitle(3)).toBe("Damage reports (3)");
  });
});

// ---- buildDamageReportViews ----

const TZ = "America/Toronto";

function detail(over: Partial<RawReportDetailRow> & { id: string }): RawReportDetailRow {
  return {
    bleacherNumber: 26,
    createdAt: "2026-09-17T16:00:00Z",
    resolvedAt: null,
    seatDamage: "none",
    haulDamage: "none",
    isSafeToSit: 1,
    isSafeToHaul: 1,
    note: null,
    creatorFirstName: null,
    creatorLastName: null,
    fixedByDriver: 0,
    fixedAt: null,
    fixerFirstName: null,
    fixerLastName: null,
    ...over,
  };
}

const reportedItem = (id: string, day: string) => ({ id, day, createdAt: `${day}T16:00:00Z` });
const photo = (id: string, reportId: string, path: string): RawReportPhotoRow => ({
  id,
  reportId,
  path,
});

function build(
  over: Partial<{
    reported: ReturnType<typeof reportedItem>[];
    details: RawReportDetailRow[];
    photos: RawReportPhotoRow[];
    acknowledgements: Record<string, any>;
    timezone: string;
  }> = {},
) {
  return buildDamageReportViews({
    reported: [],
    details: [],
    photos: [],
    acknowledgements: {},
    timezone: TZ,
    ...over,
  });
}

describe("buildDamageReportViews", () => {
  it("follows the order of the reported list, not of the detail rows (D92)", () => {
    const views = build({
      reported: [reportedItem("a", "2026-09-17"), reportedItem("b", "2026-09-19")],
      details: [detail({ id: "b" }), detail({ id: "a" })],
    });
    expect(views.map((v) => v.id)).toEqual(["a", "b"]);
    expect(views.map((v) => v.day)).toEqual(["2026-09-17", "2026-09-19"]);
  });

  it("leaves out a report that has no detail row", () => {
    const views = build({
      reported: [reportedItem("a", "2026-09-17"), reportedItem("gone", "2026-09-18")],
      details: [detail({ id: "a" })],
    });
    expect(views.map((v) => v.id)).toEqual(["a"]);
  });

  it("takes the damage levels from the stored levels and the old safe flags", () => {
    const [view] = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [
        detail({
          id: "a",
          seatDamage: "minor",
          haulDamage: "none",
          isSafeToSit: 1,
          isSafeToHaul: 0, // an unsafe flag with no level reads as major
        }),
      ],
    });
    expect(view.seat).toBe("minor");
    expect(view.haul).toBe("major");
    const [calm] = build({
      reported: [reportedItem("b", "2026-09-17")],
      details: [detail({ id: "b" })],
    });
    expect(calm.seat).toBe("none");
    expect(calm.haul).toBe("none");
  });

  it("writes the creator's name trimmed, and null when nobody is known", () => {
    const views = build({
      reported: [
        reportedItem("a", "2026-09-17"),
        reportedItem("b", "2026-09-17"),
        reportedItem("c", "2026-09-17"),
      ],
      details: [
        detail({ id: "a", creatorFirstName: "Jane", creatorLastName: "Doe" }),
        detail({ id: "b", creatorFirstName: " Sam ", creatorLastName: null }),
        detail({ id: "c", creatorFirstName: "", creatorLastName: "" }),
      ],
    });
    expect(views.map((v) => v.createdBy)).toEqual(["Jane Doe", "Sam", null]);
  });

  it("carries the bleacher number, the note and the photos of each report", () => {
    const views = build({
      reported: [reportedItem("a", "2026-09-17"), reportedItem("b", "2026-09-18")],
      details: [
        detail({ id: "a", bleacherNumber: 26, note: "Cracked weld" }),
        detail({ id: "b", bleacherNumber: null }),
      ],
      photos: [
        photo("p1", "a", "a/one.jpg"),
        photo("p2", "b", "b/two.jpg"),
        photo("p3", "a", "a/three.heic"),
        { id: "p4", reportId: null, path: "x.jpg" },
        { id: "p5", reportId: "a", path: null },
      ],
    });
    expect(views[0].bleacherNumber).toBe(26);
    expect(views[0].note).toBe("Cracked weld");
    expect(views[0].photos).toEqual([
      { id: "p1", path: "a/one.jpg" },
      { id: "p3", path: "a/three.heic" },
    ]);
    expect(views[1].bleacherNumber).toBeNull();
    expect(views[1].note).toBeNull();
    expect(views[1].photos).toEqual([{ id: "p2", path: "b/two.jpg" }]);
  });

  it("gives the resolve day in the given time zone (D37)", () => {
    const resolvedAt = "2026-09-20T02:30:00Z"; // 22:30 on the 19th in Toronto
    const toronto = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [detail({ id: "a", resolvedAt })],
      timezone: "America/Toronto",
    });
    const utc = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [detail({ id: "a", resolvedAt })],
      timezone: "UTC",
    });
    expect(toronto[0].resolvedDay).toBe("2026-09-19");
    expect(utc[0].resolvedDay).toBe("2026-09-20");
    const [open] = build({
      reported: [reportedItem("b", "2026-09-17")],
      details: [detail({ id: "b" })],
    });
    expect(open.resolvedDay).toBeNull();
  });

  it("turns the confirmations into names, days in the time zone and the inspection flag", () => {
    const [view] = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [detail({ id: "a" })],
      acknowledgements: {
        a: {
          count: 2,
          latestAt: "2026-09-20T02:30:00Z",
          entries: [
            { id: "k1", name: "Pat Lee", at: "2026-09-20T02:30:00Z", source: "inspection" },
            { id: "k2", name: "A driver", at: null, source: "standalone" },
          ],
        },
      },
    });
    expect(view.confirmations).toEqual([
      { id: "k1", name: "Pat Lee", day: "2026-09-19", duringInspection: true },
      { id: "k2", name: "A driver", day: null, duringInspection: false },
    ]);
    const [none] = build({
      reported: [reportedItem("b", "2026-09-17")],
      details: [detail({ id: "b" })],
    });
    expect(none.confirmations).toEqual([]);
  });

  it("writes the fixed mark with a name or as a driver, and only while not resolved", () => {
    const views = build({
      reported: [
        reportedItem("named", "2026-09-17"),
        reportedItem("unnamed", "2026-09-17"),
        reportedItem("resolved", "2026-09-17"),
        reportedItem("plain", "2026-09-17"),
      ],
      details: [
        detail({
          id: "named",
          fixedByDriver: 1,
          fixedAt: "2026-09-18T16:00:00Z",
          fixerFirstName: "Sam",
          fixerLastName: "Roe",
        }),
        detail({ id: "unnamed", fixedByDriver: 1, fixedAt: null }),
        detail({
          id: "resolved",
          fixedByDriver: 1,
          fixedAt: "2026-09-18T16:00:00Z",
          resolvedAt: "2026-09-19T16:00:00Z",
        }),
        detail({ id: "plain" }),
      ],
    });
    expect(views.map((v) => v.fixedMark)).toEqual([
      "Fixed by Sam Roe on 2026-09-18",
      "Fixed by a driver",
      null,
      null,
    ]);
  });
});
