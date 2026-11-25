import { describe, expect, it } from "vitest";
import type {
  RawRepairBleacherRow,
  RawRepairRow,
  RawReportCategoryRow,
  RawReportRow,
  RawServiceRow,
} from "../db/repairListQueries";
import { buildRepairRows, type RawRepairData } from "./repairRows";

// docs/specs/repairs-03-list-query.md §2 and §7. Plain objects in, list rows out: the rules of the
// Repairs list (chips, money, zone, Completed, Reported, order) with no database behind them.

const TZ = "America/Toronto";

function repair(o: Partial<RawRepairRow> & { id: string }): RawRepairRow {
  return {
    eventName: "Maintenance / Repair",
    eventStart: "2026-09-10",
    eventEnd: "2026-09-12",
    notes: null,
    createdAt: "2026-09-01T12:00:00Z",
    deleted: 0,
    status: "inbound",
    currency: "USD",
    invoiceNumber: null,
    completedAt: null,
    costCents: null,
    vendorUuid: null,
    vendorName: null,
    zoneUuid: null,
    zoneName: null,
    ...o,
  };
}

function service(o: Partial<RawServiceRow> & { id: string; repairId: string }): RawServiceRow {
  return {
    bleacherUuid: "b1",
    bleacherNumber: 1,
    categoryUuid: null,
    categoryName: null,
    severity: "minor",
    description: null,
    laborCents: 0,
    partsCents: 0,
    taxCents: 0,
    freightCents: 0,
    deleted: 0,
    createdAt: "2026-09-01T12:00:00Z",
    ...o,
  };
}

function junction(
  repairId: string,
  bleacherUuid: string,
  bleacherNumber: number | null,
  zone?: { uuid: string; name: string },
): RawRepairBleacherRow {
  return {
    repairId,
    bleacherUuid,
    bleacherNumber,
    zoneUuid: zone?.uuid ?? null,
    zoneName: zone?.name ?? null,
  };
}

function report(o: Partial<RawReportRow> & { id: string }): RawReportRow {
  return {
    bleacherUuid: "b1",
    createdAt: "2026-09-05T15:00:00Z",
    resolvedAt: null,
    repairId: null,
    ...o,
  };
}

function cat(reportId: string, categoryUuid: string): RawReportCategoryRow {
  return { reportId, categoryUuid };
}

function data(over: Partial<RawRepairData>): RawRepairData {
  return { repairs: [], services: [], bleachers: [], reports: [], reportCategories: [], ...over };
}

function one(raw: RawRepairData, timezone = TZ) {
  const rows = buildRepairRows(raw, timezone);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe("buildRepairRows: a repair with services", () => {
  const raw = data({
    repairs: [
      repair({ id: "r1", costCents: 100000, vendorUuid: "v1", vendorName: "Jessie James" }),
    ],
    services: [
      service({
        id: "s1",
        repairId: "r1",
        bleacherUuid: "b59",
        bleacherNumber: 59,
        categoryUuid: "c-bat",
        categoryName: "Batteries",
        severity: "minor",
        partsCents: 25999,
        createdAt: "2026-09-01T10:00:00Z",
      }),
      service({
        id: "s2",
        repairId: "r1",
        bleacherUuid: "b51",
        bleacherNumber: 51,
        categoryUuid: "c-hyd",
        categoryName: "Hydraulics",
        severity: "major",
        laborCents: 38000,
        partsCents: 14874,
        createdAt: "2026-09-01T11:00:00Z",
      }),
      service({
        id: "s3",
        repairId: "r1",
        bleacherUuid: "b26",
        bleacherNumber: 26,
        categoryUuid: "c-hyd",
        categoryName: "Hydraulics",
        severity: "minor",
        partsCents: 15175,
        taxCents: 100,
        freightCents: 200,
        createdAt: "2026-09-01T12:00:00Z",
      }),
    ],
    bleachers: [junction("r1", "b59", 59), junction("r1", "b26", 26), junction("r1", "b51", 51)],
  });

  it("lists the bleachers of the junction by number", () => {
    expect(one(raw).bleachers.map((b) => b.number)).toEqual([26, 51, 59]);
  });

  it("shows distinct severities in the order major, minor, routine", () => {
    expect(one(raw).severities).toEqual(["major", "minor"]);
  });

  it("shows distinct categories in the order of the services", () => {
    expect(one(raw).categories).toEqual([
      { uuid: "c-bat", name: "Batteries" },
      { uuid: "c-hyd", name: "Hydraulics" },
    ]);
  });

  it("sums Labor, Parts, Tax and Freight over the services", () => {
    const row = one(raw);
    expect(row.laborCents).toBe(38000);
    expect(row.partsCents).toBe(25999 + 14874 + 15175);
    expect(row.taxCents).toBe(100);
    expect(row.freightCents).toBe(200);
  });

  it("keeps Total as cost_cents, not the sum of the services (D32)", () => {
    expect(one(raw).totalCents).toBe(100000);
  });

  it("gives each service its own total and orders services by created_at", () => {
    const row = one(raw);
    expect(row.services.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(row.services[1].totalCents).toBe(38000 + 14874);
  });

  it("passes the vendor through", () => {
    const row = one(raw);
    expect(row.vendorUuid).toBe("v1");
    expect(row.vendorName).toBe("Jessie James");
  });
});

describe("buildRepairRows: an old repair with no services (D30)", () => {
  it("shows bleachers from the junction, empty sums, empty chips and Total from cost_cents", () => {
    const row = one(
      data({
        repairs: [repair({ id: "r1", costCents: 27501 })],
        bleachers: [junction("r1", "b1", 12)],
      }),
    );
    expect(row.bleachers).toEqual([{ uuid: "b1", number: 12 }]);
    expect(row.services).toEqual([]);
    expect(row.categories).toEqual([]);
    expect(row.severities).toEqual([]);
    expect(row.laborCents).toBeNull();
    expect(row.partsCents).toBeNull();
    expect(row.taxCents).toBeNull();
    expect(row.freightCents).toBeNull();
    expect(row.totalCents).toBe(27501);
  });

  it("gives an empty Total when cost_cents is empty", () => {
    const row = one(data({ repairs: [repair({ id: "r1", costCents: null })] }));
    expect(row.totalCents).toBeNull();
  });
});

describe("buildRepairRows: Completed (D10, D31)", () => {
  it("shows the day of completed_at in the zone for a completed repair", () => {
    const row = one(
      data({
        repairs: [repair({ id: "r1", status: "completed", completedAt: "2026-10-27T15:00:00Z" })],
      }),
    );
    expect(row.completedOn).toBe("2026-10-27");
  });

  it("falls back to event_end when completed_at is empty", () => {
    const row = one(
      data({
        repairs: [repair({ id: "r1", status: "completed", eventEnd: "2026-09-12" })],
      }),
    );
    expect(row.completedOn).toBe("2026-09-12");
  });

  it("gives nothing when completed_at and event_end are both empty", () => {
    const row = one(data({ repairs: [repair({ id: "r1", status: "completed", eventEnd: null })] }));
    expect(row.completedOn).toBeNull();
  });

  it("gives nothing for an open repair even when completed_at is set", () => {
    const row = one(
      data({
        repairs: [repair({ id: "r1", status: "in_repair", completedAt: "2026-10-27T15:00:00Z" })],
      }),
    );
    expect(row.completedOn).toBeNull();
  });
});

describe("buildRepairRows: Zone (D33)", () => {
  const z1 = { uuid: "z1", name: "Zone 1" };
  const z2 = { uuid: "z2", name: "Zone 2" };
  const z3 = { uuid: "z3", name: "Zone 3" };

  it("shows the stored zone alone, even when the bleachers sit in other zones", () => {
    const row = one(
      data({
        repairs: [repair({ id: "r1", zoneUuid: "z3", zoneName: "Zone 3" })],
        bleachers: [junction("r1", "b1", 1, z1)],
      }),
    );
    expect(row.zones).toEqual([z3]);
  });

  it("falls back to the distinct zones of the junction bleachers, ordered by name", () => {
    const row = one(
      data({
        repairs: [repair({ id: "r1" })],
        bleachers: [
          junction("r1", "b1", 1, z2),
          junction("r1", "b2", 2, z1),
          junction("r1", "b3", 3, z2),
        ],
      }),
    );
    expect(row.zones).toEqual([z1, z2]);
  });

  it("gives an empty list when there is no zone anywhere", () => {
    const row = one(
      data({ repairs: [repair({ id: "r1" })], bleachers: [junction("r1", "b1", 1)] }),
    );
    expect(row.zones).toEqual([]);
  });
});

describe("buildRepairRows: Reported (D25 to D28, D38)", () => {
  const base = {
    repairs: [repair({ id: "E1", eventStart: "2026-09-10" })],
    bleachers: [junction("E1", "b1", 1)],
  };
  const svc = service({ id: "s1", repairId: "E1", bleacherUuid: "b1", categoryUuid: "c1" });

  it("finds a report by the link alone (an old repair with no services)", () => {
    const row = one(
      data({
        ...base,
        reports: [report({ id: "rLink", repairId: "E1", resolvedAt: "2026-09-02T15:00:00Z" })],
      }),
    );
    expect(row.reported.map((r) => r.id)).toEqual(["rLink"]);
    expect(row.reported[0].day).toBe("2026-09-05");
  });

  it("ignores a linked report on a bleacher that is not in the repair", () => {
    const row = one(
      data({ ...base, reports: [report({ id: "rLink", repairId: "E1", bleacherUuid: "b9" })] }),
    );
    expect(row.reported).toEqual([]);
  });

  it("finds a report by the category of a service on the same bleacher", () => {
    const row = one(
      data({
        ...base,
        services: [svc],
        reports: [report({ id: "rCat" })],
        reportCategories: [cat("rCat", "c1")],
      }),
    );
    expect(row.reported.map((r) => r.id)).toEqual(["rCat"]);
    expect(row.services[0].reported.map((r) => r.id)).toEqual(["rCat"]);
  });

  it("counts a report that fits by both ways once", () => {
    const row = one(
      data({
        ...base,
        services: [svc],
        reports: [report({ id: "rBoth", repairId: "E1" })],
        reportCategories: [cat("rBoth", "c1")],
      }),
    );
    expect(row.reported).toHaveLength(1);
    expect(row.services[0].reported).toHaveLength(1);
  });

  describe("what does not fit", () => {
    const run = (r: RawReportRow, cats: RawReportCategoryRow[] = [cat(r.id, "c1")]) =>
      one(data({ ...base, services: [svc], reports: [r], reportCategories: cats })).reported;

    it("a report linked to another repair", () => {
      expect(run(report({ id: "r", repairId: "E2" }))).toEqual([]);
    });

    it("a report closed before event_start", () => {
      expect(run(report({ id: "r", resolvedAt: "2026-09-09T15:00:00Z" }))).toEqual([]);
    });

    it("a report created after event_start and not linked", () => {
      expect(run(report({ id: "r", createdAt: "2026-09-11T15:00:00Z" }))).toEqual([]);
    });

    it("a report on another bleacher", () => {
      expect(run(report({ id: "r", bleacherUuid: "b2" }))).toEqual([]);
    });

    it("a report with another category", () => {
      expect(run(report({ id: "r" }), [cat("r", "c2")])).toEqual([]);
    });

    it("a report with no category row", () => {
      expect(run(report({ id: "r" }), [])).toEqual([]);
    });

    it("a report whose created_at is not a date", () => {
      expect(run(report({ id: "r", createdAt: "not a date" }))).toEqual([]);
    });
  });

  describe("what fits", () => {
    const run = (r: RawReportRow) =>
      one(data({ ...base, services: [svc], reports: [r], reportCategories: [cat(r.id, "c1")] }))
        .reported;

    it("a report closed on the day of event_start", () => {
      expect(run(report({ id: "r", resolvedAt: "2026-09-10T15:00:00Z" })).map((r) => r.id)).toEqual(
        ["r"],
      );
    });

    it("a report created on the day of event_start", () => {
      expect(run(report({ id: "r", createdAt: "2026-09-10T15:00:00Z" })).map((r) => r.id)).toEqual([
        "r",
      ]);
    });

    it("a report still open", () => {
      expect(run(report({ id: "r", resolvedAt: null })).map((r) => r.id)).toEqual(["r"]);
    });

    it("a report linked to this repair counts whatever its dates are (D28)", () => {
      // The service sits on b2, which is not in the junction, so only the category way applies.
      const row = one(
        data({
          repairs: base.repairs,
          bleachers: base.bleachers,
          services: [service({ id: "s2", repairId: "E1", bleacherUuid: "b2", categoryUuid: "c1" })],
          reports: [
            report({
              id: "r",
              bleacherUuid: "b2",
              repairId: "E1",
              createdAt: "2026-10-01T15:00:00Z",
              resolvedAt: "2026-08-01T15:00:00Z",
            }),
          ],
          reportCategories: [cat("r", "c1")],
        }),
      );
      expect(row.reported.map((r) => r.id)).toEqual(["r"]);
    });
  });

  it("lists reports earliest first and counts reports, not days (D38)", () => {
    const row = one(
      data({
        ...base,
        services: [svc],
        reports: [
          report({ id: "late", createdAt: "2026-09-07T15:00:00Z" }),
          report({ id: "sameDayLater", createdAt: "2026-09-05T15:00:00Z" }),
          report({ id: "sameDayEarlier", createdAt: "2026-09-05T12:00:00Z" }),
        ],
        reportCategories: [
          cat("late", "c1"),
          cat("sameDayLater", "c1"),
          cat("sameDayEarlier", "c1"),
        ],
      }),
    );
    expect(row.reported.map((r) => r.id)).toEqual(["sameDayEarlier", "sameDayLater", "late"]);
    expect(row.reported.length - 1).toBe(2);
    expect(row.services[0].reported.map((r) => r.id)).toEqual([
      "sameDayEarlier",
      "sameDayLater",
      "late",
    ]);
  });

  it("breaks an exact tie by report id", () => {
    const row = one(
      data({
        ...base,
        services: [svc],
        reports: [report({ id: "b" }), report({ id: "a" })],
        reportCategories: [cat("a", "c1"), cat("b", "c1")],
      }),
    );
    expect(row.reported.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("gives each service only the reports of its own category, and the repair all of them", () => {
    const row = one(
      data({
        ...base,
        services: [
          service({
            id: "s1",
            repairId: "E1",
            categoryUuid: "c1",
            createdAt: "2026-09-01T10:00:00Z",
          }),
          service({
            id: "s2",
            repairId: "E1",
            categoryUuid: "c2",
            createdAt: "2026-09-01T11:00:00Z",
          }),
        ],
        reports: [report({ id: "ra" }), report({ id: "rb", createdAt: "2026-09-06T15:00:00Z" })],
        reportCategories: [cat("ra", "c1"), cat("rb", "c2")],
      }),
    );
    expect(row.services[0].reported.map((r) => r.id)).toEqual(["ra"]);
    expect(row.services[1].reported.map((r) => r.id)).toEqual(["rb"]);
    expect(row.reported.map((r) => r.id)).toEqual(["ra", "rb"]);
  });

  it("gives a service the linked reports on its own bleacher only", () => {
    const row = one(
      data({
        repairs: base.repairs,
        bleachers: [junction("E1", "b1", 1), junction("E1", "b2", 2)],
        services: [
          service({ id: "s1", repairId: "E1", bleacherUuid: "b1", categoryUuid: null }),
          service({ id: "s2", repairId: "E1", bleacherUuid: "b2", categoryUuid: null }),
        ],
        reports: [
          report({ id: "r1", bleacherUuid: "b1", repairId: "E1" }),
          report({ id: "r2", bleacherUuid: "b2", repairId: "E1" }),
        ],
      }),
    );
    expect(row.services[0].reported.map((r) => r.id)).toEqual(["r1"]);
    expect(row.services[1].reported.map((r) => r.id)).toEqual(["r2"]);
    expect(row.reported.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("finds an unlinked report only by category: a service without a category finds none", () => {
    const row = one(
      data({
        ...base,
        services: [service({ id: "s1", repairId: "E1", categoryUuid: null })],
        reports: [report({ id: "r" })],
        reportCategories: [cat("r", "c1")],
      }),
    );
    expect(row.reported).toEqual([]);
  });

  describe("a repair with no event_start", () => {
    const noStart = {
      repairs: [repair({ id: "E1", eventStart: null })],
      bleachers: [junction("E1", "b1", 1)],
      services: [svc],
    };

    it("finds a linked report", () => {
      const row = one(data({ ...noStart, reports: [report({ id: "r", repairId: "E1" })] }));
      expect(row.reported.map((r) => r.id)).toEqual(["r"]);
    });

    it("does not find an unlinked report by category", () => {
      const row = one(
        data({
          ...noStart,
          reports: [report({ id: "r" })],
          reportCategories: [cat("r", "c1")],
        }),
      );
      expect(row.reported).toEqual([]);
    });
  });

  describe("the time zone of the day (D37)", () => {
    // 2026-03-05T02:00:00Z is 21:00 on March 4 in Toronto (EST) and March 5 in UTC.
    const raw = data({
      repairs: [repair({ id: "E1", eventStart: "2026-03-04" })],
      bleachers: [junction("E1", "b1", 1)],
      services: [svc],
      reports: [report({ id: "r", createdAt: "2026-03-05T02:00:00Z" })],
      reportCategories: [cat("r", "c1")],
    });

    it("counts the report in Toronto, where it was created on the 4th", () => {
      const row = one(raw, "America/Toronto");
      expect(row.reported.map((r) => r.day)).toEqual(["2026-03-04"]);
    });

    it("does not count it in UTC, where it was created on the 5th", () => {
      expect(one(raw, "UTC").reported).toEqual([]);
    });
  });
});

describe("buildRepairRows: currency, status, flags", () => {
  it("reads any currency other than CAD as USD", () => {
    const rows = buildRepairRows(
      data({
        repairs: [
          repair({ id: "a", currency: "CAD" }),
          repair({ id: "b", currency: "EUR" }),
          repair({ id: "c", currency: null }),
        ],
      }),
      TZ,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.currency]));
    expect(byId).toEqual({ a: "CAD", b: "USD", c: "USD" });
  });

  it("passes the stored status through and reads a missing one as inbound", () => {
    const rows = buildRepairRows(
      data({
        repairs: [repair({ id: "a", status: "in_repair" }), repair({ id: "b", status: null })],
      }),
      TZ,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId).toEqual({ a: "in_repair", b: "inbound" });
  });

  it("reads the deleted flag", () => {
    const rows = buildRepairRows(
      data({ repairs: [repair({ id: "a", deleted: 1 }), repair({ id: "b", deleted: 0 })] }),
      TZ,
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.deleted]))).toEqual({ a: true, b: false });
  });

  it("keeps a service's own deleted flag (Show Deleted view returns them all)", () => {
    const row = one(
      data({
        repairs: [repair({ id: "r1", deleted: 1 })],
        services: [service({ id: "s1", repairId: "r1", deleted: 1 })],
      }),
    );
    expect(row.services[0].deleted).toBe(true);
  });
});

describe("buildRepairRows: the starting order (D36)", () => {
  it("is created_at descending, rows without created_at last, ties by id", () => {
    const rows = buildRepairRows(
      data({
        repairs: [
          repair({ id: "old", createdAt: "2026-09-01T12:00:00Z" }),
          repair({ id: "none", createdAt: null }),
          repair({ id: "tieB", createdAt: "2026-09-03T12:00:00Z" }),
          repair({ id: "tieA", createdAt: "2026-09-03T12:00:00Z" }),
        ],
      }),
      TZ,
    );
    expect(rows.map((r) => r.id)).toEqual(["tieA", "tieB", "old", "none"]);
  });
});
