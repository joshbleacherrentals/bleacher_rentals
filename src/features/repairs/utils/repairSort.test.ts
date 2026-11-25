import { describe, expect, it } from "vitest";
import {
  REPAIR_SORT_KEYS,
  nextRepairSort,
  parseRepairSort,
  serializeRepairSort,
  sortRepairs,
  type RepairSort,
  type RepairSortKey,
} from "./repairSort";
import { repairRow } from "./repairRowFixture";
import type { RepairListRow, ReportedReport } from "./repairRows";

// docs/specs/repairs-05-toolbar.md §2.5 and §7 (D72 to D75).

const ids = (rows: readonly RepairListRow[]) => rows.map((r) => r.id);
const asc = (key: RepairSortKey): RepairSort => ({ key, direction: "asc" });
const desc = (key: RepairSortKey): RepairSort => ({ key, direction: "desc" });
const report = (id: string, day: string): ReportedReport => ({
  id,
  day,
  createdAt: `${day}T12:00:00Z`,
});

describe("sortRepairs by each key", () => {
  // Three rows in the starting order a, b, c; each case gives them values for one key.
  const cases: { key: RepairSortKey; rows: RepairListRow[]; ascending: string[] }[] = [
    {
      key: "reported",
      rows: [
        repairRow({ id: "a", reported: [report("r1", "2026-09-20"), report("r2", "2026-09-01")] }),
        repairRow({ id: "b", reported: [report("r3", "2026-09-10")] }),
        repairRow({ id: "c", reported: [report("r4", "2026-08-30")] }),
      ],
      // the first report of a row is its earliest: a 2026-09-20, b 09-10, c 08-30 (D75)
      ascending: ["c", "b", "a"],
    },
    {
      key: "from",
      rows: [
        repairRow({ id: "a", eventStart: "2026-09-12" }),
        repairRow({ id: "b", eventStart: "2026-09-01" }),
        repairRow({ id: "c", eventStart: "2026-09-30" }),
      ],
      ascending: ["b", "a", "c"],
    },
    {
      key: "to",
      rows: [
        repairRow({ id: "a", eventEnd: "2026-10-12" }),
        repairRow({ id: "b", eventEnd: "2026-10-01" }),
        repairRow({ id: "c", eventEnd: "2026-09-30" }),
      ],
      ascending: ["c", "b", "a"],
    },
    {
      key: "completed",
      rows: [
        repairRow({ id: "a", completedOn: "2026-11-02" }),
        repairRow({ id: "b", completedOn: "2026-11-30" }),
        repairRow({ id: "c", completedOn: "2026-10-31" }),
      ],
      ascending: ["c", "a", "b"],
    },
    {
      key: "zone",
      rows: [
        repairRow({ id: "a", zones: [{ uuid: "z3", name: "Zone 3" }] }),
        repairRow({
          id: "b",
          zones: [
            { uuid: "z1", name: "Zone 1" },
            { uuid: "z9", name: "Zone 9" },
          ],
        }),
        repairRow({ id: "c", zones: [{ uuid: "z2", name: "Zone 2" }] }),
      ],
      // D75: a row is sorted by its first zone, so b (Zone 1, Zone 9) sorts as Zone 1
      ascending: ["b", "c", "a"],
    },
    {
      key: "notes",
      rows: [
        repairRow({ id: "a", notes: "welded" }),
        repairRow({ id: "b", notes: "Axle" }),
        repairRow({ id: "c", notes: "tires" }),
      ],
      ascending: ["b", "c", "a"],
    },
    {
      key: "vendor",
      rows: [
        repairRow({ id: "a", vendorName: "Suncoast" }),
        repairRow({ id: "b", vendorName: "caprock Tire" }),
        repairRow({ id: "c", vendorName: "Dallas" }),
      ],
      ascending: ["b", "c", "a"],
    },
    {
      key: "invoice",
      rows: [
        repairRow({ id: "a", invoiceNumber: "JJ-12" }),
        repairRow({ id: "b", invoiceNumber: "JJ-5" }),
        repairRow({ id: "c", invoiceNumber: "jj-9" }),
      ],
      // numbers inside the text are compared as numbers, case is ignored (D72)
      ascending: ["b", "c", "a"],
    },
    {
      key: "status",
      rows: [
        repairRow({ id: "a", status: "confirm_repair" }),
        repairRow({ id: "b", status: "inbound" }),
        repairRow({ id: "c", status: "in_repair" }),
      ],
      // the course of a repair (D74), not the alphabet
      ascending: ["b", "c", "a"],
    },
    {
      key: "labor",
      rows: [
        repairRow({ id: "a", laborCents: 500 }),
        repairRow({ id: "b", laborCents: 100 }),
        repairRow({ id: "c", laborCents: 300 }),
      ],
      ascending: ["b", "c", "a"],
    },
    {
      key: "parts",
      rows: [
        repairRow({ id: "a", partsCents: 90 }),
        repairRow({ id: "b", partsCents: 1000 }),
        repairRow({ id: "c", partsCents: 20 }),
      ],
      ascending: ["c", "a", "b"],
    },
    {
      key: "tax",
      rows: [
        repairRow({ id: "a", taxCents: 3 }),
        repairRow({ id: "b", taxCents: 2 }),
        repairRow({ id: "c", taxCents: 1 }),
      ],
      ascending: ["c", "b", "a"],
    },
    {
      key: "freight",
      rows: [
        repairRow({ id: "a", freightCents: 7 }),
        repairRow({ id: "b", freightCents: 70 }),
        repairRow({ id: "c", freightCents: 700 }),
      ],
      ascending: ["a", "b", "c"],
    },
    {
      key: "total",
      rows: [
        repairRow({ id: "a", totalCents: 164315 }),
        repairRow({ id: "b", totalCents: 4500 }),
        repairRow({ id: "c", totalCents: 99999 }),
      ],
      ascending: ["b", "c", "a"],
    },
  ];

  it("covers the fourteen keys", () => {
    expect(cases.map((c) => c.key).sort()).toEqual([...REPAIR_SORT_KEYS].sort());
  });

  for (const { key, rows, ascending } of cases) {
    it(`${key}: ascending and descending`, () => {
      expect(ids(sortRepairs(rows, asc(key)))).toEqual(ascending);
      expect(ids(sortRepairs(rows, desc(key)))).toEqual([...ascending].reverse());
    });
  }
});

describe("sortRepairs empty values (D73)", () => {
  const rows = [
    repairRow({ id: "a", totalCents: 500 }),
    repairRow({ id: "none", totalCents: null }),
    repairRow({ id: "b", totalCents: 100 }),
    repairRow({ id: "zero", totalCents: 0 }),
  ];

  it("puts an empty value first when ascending and last when descending", () => {
    expect(ids(sortRepairs(rows, asc("total")))).toEqual(["none", "zero", "b", "a"]);
    expect(ids(sortRepairs(rows, desc("total")))).toEqual(["a", "b", "zero", "none"]);
  });

  it("treats a zero amount as a value, not as empty", () => {
    const out = ids(sortRepairs(rows, asc("total")));
    expect(out.indexOf("none")).toBeLessThan(out.indexOf("zero"));
  });

  it("treats a blank text, an unnamed zone and a missing day as empty", () => {
    const text = [
      repairRow({ id: "a", vendorName: "Dallas" }),
      repairRow({ id: "blank", vendorName: "   " }),
      repairRow({ id: "null", vendorName: null }),
    ];
    expect(
      ids(sortRepairs(text, asc("vendor")))
        .slice(0, 2)
        .sort(),
    ).toEqual(["blank", "null"]);
    expect(ids(sortRepairs(text, asc("vendor")))[2]).toBe("a");

    const zones = [
      repairRow({ id: "a", zones: [{ uuid: "z", name: "Zone 1" }] }),
      repairRow({ id: "unnamed", zones: [{ uuid: "u", name: null }] }),
      repairRow({ id: "none", zones: [] }),
    ];
    expect(ids(sortRepairs(zones, desc("zone")))[0]).toBe("a");

    const days = [
      repairRow({ id: "a", eventEnd: "2026-09-01" }),
      repairRow({ id: "none", eventEnd: null }),
    ];
    expect(ids(sortRepairs(days, asc("to")))).toEqual(["none", "a"]);
    expect(ids(sortRepairs(days, desc("to")))).toEqual(["a", "none"]);
  });
});

describe("sortRepairs status", () => {
  it("follows the course and puts a status the code does not know after Completed", () => {
    const rows = ["completed", "waiting_repair", "weird", "triaged", "inbound"].map((status) =>
      repairRow({ id: status, status: status as RepairListRow["status"] }),
    );
    expect(ids(sortRepairs(rows, asc("status")))).toEqual([
      "inbound",
      "triaged",
      "waiting_repair",
      "completed",
      "weird",
    ]);
  });
});

describe("sortRepairs ties and null", () => {
  it("keeps the starting order for equal values, whichever way it sorts (D36)", () => {
    const rows = [
      repairRow({ id: "a", vendorName: "X" }),
      repairRow({ id: "b", vendorName: "x" }),
      repairRow({ id: "c", vendorName: "X" }),
    ];
    expect(ids(sortRepairs(rows, asc("vendor")))).toEqual(["a", "b", "c"]);
    expect(ids(sortRepairs(rows, desc("vendor")))).toEqual(["a", "b", "c"]);
  });

  it("returns the same order for null and does not change its input", () => {
    const rows = [repairRow({ id: "b", totalCents: 2 }), repairRow({ id: "a", totalCents: 1 })];
    const copy = [...rows];
    expect(ids(sortRepairs(rows, null))).toEqual(["b", "a"]);
    sortRepairs(rows, asc("total"));
    expect(rows).toEqual(copy);
  });
});

describe("nextRepairSort (D72)", () => {
  const textKeys: RepairSortKey[] = ["zone", "notes", "status", "vendor", "invoice"];
  const dayKeys: RepairSortKey[] = ["reported", "from", "to", "completed"];
  const moneyKeys: RepairSortKey[] = ["labor", "parts", "tax", "freight", "total"];

  it("starts a text column ascending and a date or money column descending", () => {
    for (const key of textKeys) expect(nextRepairSort(null, key), key).toEqual(asc(key));
    for (const key of [...dayKeys, ...moneyKeys]) {
      expect(nextRepairSort(null, key), key).toEqual(desc(key));
    }
  });

  it("flips the direction on the same key, both ways, with no third state", () => {
    expect(nextRepairSort(asc("vendor"), "vendor")).toEqual(desc("vendor"));
    expect(nextRepairSort(desc("vendor"), "vendor")).toEqual(asc("vendor"));
    expect(nextRepairSort(desc("total"), "total")).toEqual(asc("total"));
    expect(nextRepairSort(asc("total"), "total")).toEqual(desc("total"));
  });

  it("starts another key with its own first direction", () => {
    expect(nextRepairSort(asc("vendor"), "total")).toEqual(desc("total"));
    expect(nextRepairSort(desc("total"), "vendor")).toEqual(asc("vendor"));
  });
});

describe("serializeRepairSort and parseRepairSort", () => {
  it("writes null as nothing and a sort as key:direction", () => {
    expect(serializeRepairSort(null)).toBeNull();
    expect(serializeRepairSort(desc("total"))).toBe("total:desc");
  });

  it("round-trips every key and direction", () => {
    for (const key of REPAIR_SORT_KEYS) {
      for (const direction of ["asc", "desc"] as const) {
        const sort = { key, direction };
        expect(parseRepairSort(serializeRepairSort(sort))).toEqual(sort);
      }
    }
  });

  it("reads a bad key, a bad direction or nothing as null", () => {
    expect(parseRepairSort(null)).toBeNull();
    expect(parseRepairSort("")).toBeNull();
    expect(parseRepairSort("total")).toBeNull();
    expect(parseRepairSort("nope:asc")).toBeNull();
    expect(parseRepairSort("total:up")).toBeNull();
    expect(parseRepairSort("total:asc:x")).toBeNull();
  });
});
