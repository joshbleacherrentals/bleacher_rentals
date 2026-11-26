import { describe, expect, it } from "vitest";
import { ALL_TIME, bleacher, figuresOf, repair, service, yearOf, zone } from "./analyticsFixture";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.5 and §5: the zone table.

const zones = [zone("z10", "Zone 10"), zone("z2", "Zone 2"), zone("z1", "Zone 1")];

describe("the zone table", () => {
  it("lists every zone with zeros when there is nothing else, and an Unassigned row last", () => {
    const { zones: table } = figuresOf({ zones });
    expect(table.rows.map((r) => r.name)).toEqual(["Zone 1", "Zone 2", "Zone 10", "Unassigned"]);
    for (const row of table.rows) {
      expect(row).toMatchObject({
        units: 0,
        workOrders: 0,
        costCents: 0,
        avgCostCents: 0,
        share: 0,
      });
    }
    expect(table.rows.map((r) => r.zoneId)).toEqual(["z1", "z2", "z10", null]);
    expect(table.total).toEqual({
      units: 0,
      workOrders: 0,
      costCents: 0,
      avgCostCents: 0,
      share: 0,
    });
  });

  it("puts Zone 2 before Zone 10 and ignores case", () => {
    const { zones: table } = figuresOf({
      zones: [zone("a", "zone 10"), zone("b", "Zone 9"), zone("c", "ZONE 2")],
    });
    expect(table.rows.map((r) => r.name)).toEqual(["ZONE 2", "Zone 9", "zone 10", "Unassigned"]);
  });

  it("counts a repair for its own zone and not for the zones of its bleachers (D19)", () => {
    const { zones: table } = figuresOf({
      zones,
      bleachers: [bleacher({ id: "b3", zoneId: "z10" })],
      repairs: [repair({ id: "r1", zoneId: "z2" })],
      services: [service({ id: "s1", repairId: "r1", bleacherId: "b3", laborCents: 900 })],
      repairBleachers: [{ repairId: "r1", bleacherId: "b3" }],
    });
    const byName = Object.fromEntries(table.rows.map((r) => [r.name, r]));
    expect(byName["Zone 2"]).toMatchObject({ workOrders: 1, costCents: 900 });
    expect(byName["Zone 10"]).toMatchObject({ units: 1, workOrders: 0, costCents: 0 });
  });

  it("sends a bleacher or a repair with no zone, or with a zone that is not listed, to Unassigned", () => {
    const { zones: table } = figuresOf({
      zones,
      bleachers: [
        bleacher({ id: "b1", zoneId: "z2" }),
        bleacher({ id: "b4" }),
        bleacher({ id: "b5", zoneId: "no-such-zone" }),
      ],
      repairs: [
        repair({ id: "r1", costCents: 300 }),
        repair({ id: "r2", zoneId: "no-such-zone", costCents: 200 }),
      ],
    });
    const unassigned = table.rows.at(-1)!;
    expect(unassigned).toMatchObject({
      zoneId: null,
      name: "Unassigned",
      units: 2,
      workOrders: 2,
      costCents: 500,
    });
    expect(table.rows.find((r) => r.zoneId === "z2")).toMatchObject({ units: 1, workOrders: 0 });
  });

  it("gives units, work orders, cost, average and share for every row, and the total row", () => {
    const { zones: table, cards } = figuresOf({
      zones,
      bleachers: [
        bleacher({ id: "b1", zoneId: "z2" }),
        bleacher({ id: "b2", zoneId: "z2" }),
        bleacher({ id: "b3", zoneId: "z10" }),
        bleacher({ id: "b4" }),
        bleacher({ id: "b5", zoneId: "gone-zone" }),
      ],
      repairs: [
        repair({ id: "r1", zoneId: "z2", costCents: 1000 }),
        repair({ id: "r2", zoneId: "z2", costCents: 500 }),
        repair({ id: "r3", zoneId: "z10" }),
        repair({ id: "r4", costCents: 300 }),
        repair({ id: "r5", zoneId: "unknown-zone", costCents: 200 }),
      ],
    });
    expect(table.rows).toEqual([
      {
        zoneId: "z1",
        name: "Zone 1",
        units: 0,
        workOrders: 0,
        costCents: 0,
        avgCostCents: 0,
        share: 0,
      },
      {
        zoneId: "z2",
        name: "Zone 2",
        units: 2,
        workOrders: 2,
        costCents: 1500,
        avgCostCents: 750,
        share: 0.75,
      },
      {
        zoneId: "z10",
        name: "Zone 10",
        units: 1,
        workOrders: 1,
        costCents: 0,
        avgCostCents: 0,
        share: 0,
      },
      {
        zoneId: null,
        name: "Unassigned",
        units: 2,
        workOrders: 2,
        costCents: 500,
        avgCostCents: 250,
        share: 0.25,
      },
    ]);
    // The total row: 5 bleachers, 5 repairs, $20.00, and the card's average (2000 / 5 = 400).
    expect(table.total).toEqual({
      units: 5,
      workOrders: 5,
      costCents: 2000,
      avgCostCents: 400,
      share: 1,
    });
    expect(table.total.avgCostCents).toBe(cards.avgPerBleacherCents);
  });

  it("converts the cost of a CAD repair and the costs of the rows add up to the total spend", () => {
    const { zones: table, cards } = figuresOf(
      {
        zones,
        repairs: [
          repair({ id: "r1", currency: "CAD", zoneId: "z1", costCents: 1001 }),
          repair({ id: "r2", zoneId: "z1", costCents: 1000 }),
          repair({ id: "r3", currency: "CAD", costCents: 4000 }),
        ],
      },
      ALL_TIME,
      () => 0.5,
    );
    expect(table.rows.find((r) => r.zoneId === "z1")!.costCents).toBe(501 + 1000);
    expect(table.rows.reduce((sum, r) => sum + r.costCents, 0)).toBe(cards.totalSpendCents);
    expect(table.total.costCents).toBe(cards.totalSpendCents);
    expect(table.total.costCents).toBe(501 + 1000 + 2000);
  });

  it("follows the period for the repairs and not for the bleachers", () => {
    const { zones: table } = figuresOf(
      {
        zones,
        bleachers: [bleacher({ id: "b1", zoneId: "z1" })],
        repairs: [
          repair({ id: "r1", zoneId: "z1", eventStart: "2025-05-05", costCents: 100 }),
          repair({ id: "r2", zoneId: "z1", eventStart: "2026-05-05", costCents: 700 }),
        ],
      },
      yearOf(2026),
    );
    expect(table.rows.find((r) => r.zoneId === "z1")).toMatchObject({
      units: 1,
      workOrders: 1,
      costCents: 700,
      share: 1,
    });
  });

  it("has a total share of 0 when nothing was spent", () => {
    const { zones: table } = figuresOf({
      zones,
      bleachers: [bleacher({ id: "b1", zoneId: "z1" })],
      repairs: [repair({ id: "r1", zoneId: "z1" })],
    });
    expect(table.total.share).toBe(0);
    expect(table.total.workOrders).toBe(1);
  });
});
