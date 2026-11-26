import { describe, expect, it } from "vitest";
import { ALL_TIME, bleacher, budget, figuresOf, repair, service, yearOf } from "./analyticsFixture";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.4 and §5: the five cards and the CAD counters.

describe("Total Fleet Maintenance Spend", () => {
  it("adds a USD repair as it is and converts a CAD repair at its rate (C$100.00 at 0.7 is $70.00)", () => {
    const { cards, cad } = figuresOf(
      {
        repairs: [repair({ id: "r1" }), repair({ id: "r2", currency: "CAD" })],
        services: [
          service({ id: "s1", repairId: "r1", laborCents: 10000, partsCents: 5000 }),
          service({ id: "s2", repairId: "r2", laborCents: 10000 }),
        ],
      },
      ALL_TIME,
      () => 0.7,
    );
    expect(cards.totalSpendCents).toBe(15000 + 7000);
    expect(cad).toEqual({ converted: 1, withoutRate: 0 });
  });

  it("converts a CAD repair whole, not service by service (R2, D37)", () => {
    // Three services of 1 cent at 0.5: each alone rounds to 1 cent (3 in all), the sum 3 rounds to 2.
    const { cards } = figuresOf(
      {
        repairs: [repair({ id: "r1", currency: "CAD" })],
        services: [
          service({ id: "s1", repairId: "r1", laborCents: 1 }),
          service({ id: "s2", repairId: "r1", partsCents: 1 }),
          service({ id: "s3", repairId: "r1", taxCents: 1 }),
        ],
      },
      ALL_TIME,
      () => 0.5,
    );
    expect(cards.totalSpendCents).toBe(2);
  });

  it("takes the rate of the Repair from day of each CAD repair (D6)", () => {
    const rateFor = (day: string) =>
      day === "2026-03-10" ? 0.5 : day === "2026-04-01" ? 0.8 : null;
    const { cards } = figuresOf(
      {
        repairs: [
          repair({ id: "r1", currency: "CAD", eventStart: "2026-03-10", costCents: 1000 }),
          repair({ id: "r2", currency: "CAD", eventStart: "2026-04-01", costCents: 1000 }),
        ],
      },
      ALL_TIME,
      rateFor,
    );
    expect(cards.totalSpendCents).toBe(500 + 800);
  });

  it("never asks for a rate for a USD repair", () => {
    const { cards } = figuresOf(
      { repairs: [repair({ id: "r1", costCents: 4200 })] },
      ALL_TIME,
      () => {
        throw new Error("no rate is needed for USD");
      },
    );
    expect(cards.totalSpendCents).toBe(4200);
  });

  it("counts a repair of every status (D12)", () => {
    const statuses = [
      "inbound",
      "triaged",
      "waiting_repair",
      "in_repair",
      "confirm_repair",
      "completed",
    ] as const;
    const repairs = statuses.map((status, i) =>
      repair({ id: `r${i}`, status, costCents: (i + 1) * 100 }),
    );
    expect(figuresOf({ repairs }).cards.totalSpendCents).toBe(100 + 200 + 300 + 400 + 500 + 600);
  });

  it("filters by the first four digits of the Repair from day (D12)", () => {
    const repairs = [
      repair({ id: "a", eventStart: "2025-12-31", costCents: 1000 }),
      repair({ id: "b", eventStart: "2026-01-01", costCents: 2000 }),
      repair({ id: "c", eventStart: "2026-12-31", costCents: 4000 }),
    ];
    expect(figuresOf({ repairs }, yearOf(2026)).cards.totalSpendCents).toBe(6000);
    expect(figuresOf({ repairs }, yearOf(2025)).cards.totalSpendCents).toBe(1000);
    expect(figuresOf({ repairs }, ALL_TIME).cards.totalSpendCents).toBe(7000);
    expect(figuresOf({ repairs }, yearOf(2024)).cards.totalSpendCents).toBe(0);
  });

  it("is the sum of the four amounts of the services when a repair has services, not its cost_cents", () => {
    const { cards } = figuresOf({
      repairs: [repair({ id: "r1", costCents: 9999 })],
      services: [
        service({ id: "s1", repairId: "r1", laborCents: 100, partsCents: 200 }),
        service({ id: "s2", repairId: "r1", taxCents: 30, freightCents: 20 }),
      ],
    });
    expect(cards.totalSpendCents).toBe(350);
  });

  it("is the stored cost_cents when a repair has no service (R3)", () => {
    const { cards } = figuresOf({ repairs: [repair({ id: "r1", costCents: 777 })] });
    expect(cards.totalSpendCents).toBe(777);
  });

  it("ignores a service whose repair is not in the list", () => {
    const { cards } = figuresOf({
      repairs: [repair({ id: "r1" })],
      services: [service({ id: "s1", repairId: "gone", laborCents: 5000 })],
    });
    expect(cards.totalSpendCents).toBe(0);
  });
});

describe("CAD counters (R4, D9, D10)", () => {
  it("leaves a CAD repair with no rate out of every figure and counts it in withoutRate", () => {
    const { cards, cad, zones } = figuresOf({
      repairs: [
        repair({ id: "r1", costCents: 1000 }),
        repair({ id: "r2", currency: "CAD", costCents: 5000 }),
      ],
    });
    expect(cards.totalSpendCents).toBe(1000);
    expect(cards.openWorkOrders.total).toBe(1);
    expect(zones.total.workOrders).toBe(1);
    expect(cad).toEqual({ converted: 0, withoutRate: 1 });
  });

  it("counts only the CAD repairs of the period", () => {
    const repairs = [
      repair({ id: "r1", currency: "CAD", eventStart: "2025-06-01", costCents: 100 }),
      repair({ id: "r2", currency: "CAD", eventStart: "2026-06-01", costCents: 100 }),
      repair({ id: "r3", currency: "CAD", eventStart: "2026-07-01", costCents: 100 }),
    ];
    const rateFor = (day: string) => (day >= "2026-07-01" ? 0.7 : null);
    expect(figuresOf({ repairs }, yearOf(2026), rateFor).cad).toEqual({
      converted: 1,
      withoutRate: 1,
    });
    expect(figuresOf({ repairs }, yearOf(2025), rateFor).cad).toEqual({
      converted: 0,
      withoutRate: 1,
    });
    expect(figuresOf({ repairs }, ALL_TIME, rateFor).cad).toEqual({
      converted: 1,
      withoutRate: 2,
    });
  });

  it("has no CAD repair, so both counters are 0", () => {
    expect(figuresOf({ repairs: [repair({ id: "r1" })] }).cad).toEqual({
      converted: 0,
      withoutRate: 0,
    });
  });

  it("returns the period it was given", () => {
    expect(figuresOf({}, yearOf(2025)).period).toEqual({ kind: "year", year: 2025 });
    expect(figuresOf({}, ALL_TIME).period).toEqual({ kind: "all" });
  });
});

describe("Bleachers Ready (D16, D36)", () => {
  const five = ["b1", "b2", "b3", "b4", "b5"].map((id) => bleacher({ id }));

  it("is about today: it ignores the year and counts a bleacher in two open repairs once", () => {
    const inputs = {
      bleachers: five,
      repairs: [
        repair({ id: "r1", eventStart: "2020-01-01", status: "inbound" }),
        repair({ id: "r2", eventStart: "2026-05-01", status: "in_repair" }),
      ],
      repairBleachers: [
        { repairId: "r1", bleacherId: "b1" },
        { repairId: "r1", bleacherId: "b2" },
        { repairId: "r2", bleacherId: "b2" },
      ],
    };
    for (const period of [ALL_TIME, yearOf(2026), yearOf(2020), yearOf(1999)]) {
      const { ready } = figuresOf(inputs, period).cards;
      expect(ready).toEqual({ ready: 3, total: 5, ratio: 3 / 5 });
    }
  });

  it("ignores a completed repair", () => {
    const { ready } = figuresOf({
      bleachers: five,
      repairs: [repair({ id: "r1", status: "completed" })],
      repairBleachers: [{ repairId: "r1", bleacherId: "b1" }],
    }).cards;
    expect(ready).toEqual({ ready: 5, total: 5, ratio: 1 });
  });

  it("is blocked by every status except completed", () => {
    const statuses = [
      "inbound",
      "triaged",
      "waiting_repair",
      "in_repair",
      "confirm_repair",
    ] as const;
    const { ready } = figuresOf({
      bleachers: five,
      repairs: statuses.map((status, i) => repair({ id: `r${i}`, status })),
      repairBleachers: statuses.map((_, i) => ({ repairId: `r${i}`, bleacherId: `b${i + 1}` })),
    }).cards;
    expect(ready).toEqual({ ready: 0, total: 5, ratio: 0 });
  });

  it("never counts a bleacher that is not live", () => {
    const { ready } = figuresOf({
      bleachers: five,
      repairs: [repair({ id: "r1" })],
      repairBleachers: [{ repairId: "r1", bleacherId: "deleted-bleacher" }],
    }).cards;
    expect(ready).toEqual({ ready: 5, total: 5, ratio: 1 });
  });

  it("is blocked by a CAD repair that has no rate (readiness has nothing to do with money)", () => {
    const { ready } = figuresOf({
      bleachers: five,
      repairs: [repair({ id: "r1", currency: "CAD" })],
      repairBleachers: [{ repairId: "r1", bleacherId: "b5" }],
    }).cards;
    expect(ready).toEqual({ ready: 4, total: 5, ratio: 4 / 5 });
  });

  it("is not blocked by a repair with no list of bleachers (R3)", () => {
    const { ready } = figuresOf({
      bleachers: five,
      repairs: [repair({ id: "r1" })],
      services: [service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 100 })],
    }).cards;
    expect(ready.ready).toBe(5);
  });

  it("is 0 of 0 with ratio 0 when there is no bleacher", () => {
    expect(figuresOf({}).cards.ready).toEqual({ ready: 0, total: 0, ratio: 0 });
  });

  it("gives bleachersTotal as the number of live bleachers", () => {
    expect(figuresOf({ bleachers: five }).cards.bleachersTotal).toBe(5);
  });
});

describe("Avg Maint Spend / Bleacher and its range (D14)", () => {
  const inputs = {
    bleachers: [bleacher({ id: "b1" }), bleacher({ id: "b2" }), bleacher({ id: "b3" })],
    repairs: [repair({ id: "r1" }), repair({ id: "r2", eventStart: "2025-02-02" })],
    services: [
      service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 10000 }),
      service({ id: "s2", repairId: "r1", bleacherId: "b1", partsCents: 5000 }),
      service({ id: "s3", repairId: "r1", bleacherId: "b2", laborCents: 20000 }),
      service({ id: "s4", repairId: "r1", bleacherId: "deleted-bleacher", laborCents: 99999 }),
      service({ id: "s5", repairId: "r2", bleacherId: "b3", laborCents: 7000 }),
    ],
  };

  it("divides the spend by all live bleachers and rounds to a cent", () => {
    // All five services count in the spend, the one on the deleted bleacher too: 141 999 cents.
    const total = 10000 + 5000 + 20000 + 99999 + 7000;
    const { cards } = figuresOf(inputs);
    expect(cards.totalSpendCents).toBe(total);
    expect(cards.avgPerBleacherCents).toBe(Math.round(total / 3));
  });

  it("rounds a half up: 5 cents over 2 bleachers is 3 cents", () => {
    const { cards } = figuresOf({
      bleachers: [bleacher({ id: "b1" }), bleacher({ id: "b2" })],
      repairs: [repair({ id: "r1", costCents: 5 })],
    });
    expect(cards.avgPerBleacherCents).toBe(3);
  });

  it("gives the range of the spend of one bleacher: a bleacher with no service is 0", () => {
    const { rangeCents } = figuresOf(inputs, yearOf(2026)).cards;
    // b1 15000, b2 20000, b3 0 (its only service is of the year 2025). The service on the deleted
    // bleacher is in the totals but not in the range.
    expect(rangeCents).toEqual({ min: 0, max: 20000 });
  });

  it("follows the period: the 2025 service counts for b3 in All time", () => {
    const { rangeCents } = figuresOf(inputs, ALL_TIME).cards;
    expect(rangeCents).toEqual({ min: 7000, max: 20000 });
  });

  it("leaves a CAD repair with no rate out of the range", () => {
    const { rangeCents } = figuresOf({
      bleachers: [bleacher({ id: "b1" })],
      repairs: [repair({ id: "r1", currency: "CAD" })],
      services: [service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 5000 })],
    }).cards;
    expect(rangeCents).toEqual({ min: 0, max: 0 });
  });

  it("converts the services of a CAD repair for the range at the rate of the repair (R2)", () => {
    const { rangeCents } = figuresOf(
      {
        bleachers: [bleacher({ id: "b1" })],
        repairs: [repair({ id: "r1", currency: "CAD" })],
        services: [service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 10000 })],
      },
      ALL_TIME,
      () => 0.7,
    ).cards;
    expect(rangeCents).toEqual({ min: 7000, max: 7000 });
  });

  it("is 0 and 0 to 0 with no bleacher, however large the spend", () => {
    const { cards } = figuresOf({ repairs: [repair({ id: "r1", costCents: 1000 })] });
    expect(cards.totalSpendCents).toBe(1000);
    expect(cards.avgPerBleacherCents).toBe(0);
    expect(cards.rangeCents).toEqual({ min: 0, max: 0 });
  });
});

describe("Active Open Work Orders (D15, D17)", () => {
  const repairs = [
    repair({ id: "a", status: "inbound" }),
    repair({ id: "b", status: "inbound" }),
    repair({ id: "c", status: "triaged" }),
    repair({ id: "d", status: "waiting_repair" }),
    repair({ id: "e", status: "in_repair" }),
    repair({ id: "f", status: "confirm_repair" }),
    repair({ id: "g", status: "completed" }),
  ];

  it("counts the five unfinished statuses and leaves Completed out", () => {
    const { openWorkOrders } = figuresOf({ repairs }).cards;
    expect(openWorkOrders).toEqual({
      total: 6,
      byStatus: { inbound: 2, triaged: 1, waiting_repair: 1, in_repair: 1, confirm_repair: 1 },
    });
  });

  it("follows the year and leaves out a CAD repair with no rate", () => {
    const more = [
      ...repairs,
      repair({ id: "h", status: "inbound", eventStart: "2025-01-01" }),
      repair({ id: "i", status: "triaged", currency: "CAD" }),
    ];
    expect(figuresOf({ repairs: more }, yearOf(2026)).cards.openWorkOrders.total).toBe(6);
    expect(figuresOf({ repairs: more }, yearOf(2025)).cards.openWorkOrders).toEqual({
      total: 1,
      byStatus: { inbound: 1, triaged: 0, waiting_repair: 0, in_repair: 0, confirm_repair: 0 },
    });
    expect(figuresOf({ repairs: more }, ALL_TIME).cards.openWorkOrders.total).toBe(7);
    expect(
      figuresOf({ repairs: more }, ALL_TIME, () => 0.7).cards.openWorkOrders.byStatus.triaged,
    ).toBe(2);
  });

  it("is all zeros with no repair", () => {
    expect(figuresOf({}).cards.openWorkOrders).toEqual({
      total: 0,
      byStatus: { inbound: 0, triaged: 0, waiting_repair: 0, in_repair: 0, confirm_repair: 0 },
    });
  });
});

describe("Annual Budget Utilization (D18, D40)", () => {
  const spending = [repair({ id: "r1", costCents: 250000 })];

  it("reads the USD row of the chosen year", () => {
    const { budget: b } = figuresOf(
      { repairs: spending, budgets: [budget(2026, 1000000)] },
      yearOf(2026),
    ).cards;
    expect(b).toEqual({
      setCents: 1000000,
      spentCents: 250000,
      remainingCents: 750000,
      usedRatio: 0.25,
      isOver: false,
    });
  });

  it("is not set for a year with no row", () => {
    const { budget: b } = figuresOf(
      {
        repairs: [repair({ id: "r1", eventStart: "2025-03-03", costCents: 900 })],
        budgets: [budget(2026, 1000000)],
      },
      yearOf(2025),
    ).cards;
    expect(b).toEqual({
      setCents: null,
      spentCents: 900,
      remainingCents: null,
      usedRatio: null,
      isOver: false,
    });
  });

  it("counts a budget of exactly $0 as not set (D40)", () => {
    const { budget: b } = figuresOf(
      { repairs: spending, budgets: [budget(2026, 0)] },
      yearOf(2026),
    ).cards;
    expect(b.setCents).toBeNull();
    expect(b.usedRatio).toBeNull();
    expect(b.isOver).toBe(false);
  });

  it("ignores a row in another currency", () => {
    const { budget: b } = figuresOf(
      { repairs: spending, budgets: [budget(2026, 500000, "CAD")] },
      yearOf(2026),
    ).cards;
    expect(b.setCents).toBeNull();
  });

  it("is not set with no row at all", () => {
    expect(figuresOf({ repairs: spending }, yearOf(2026)).cards.budget.setCents).toBeNull();
    expect(figuresOf({ repairs: spending }, ALL_TIME).cards.budget.setCents).toBeNull();
  });

  it("is, for All time, the sum of every USD row above 0 against all the spend of all time", () => {
    const { budget: b } = figuresOf(
      {
        repairs: [
          repair({ id: "r1", eventStart: "2025-01-01", costCents: 100000 }),
          repair({ id: "r2", eventStart: "2026-01-01", costCents: 200000 }),
        ],
        budgets: [
          budget(2024, 0),
          budget(2025, 1000000),
          budget(2026, 2000000),
          budget(2026, 9999999, "CAD"),
        ],
      },
      ALL_TIME,
    ).cards;
    expect(b).toEqual({
      setCents: 3000000,
      spentCents: 300000,
      remainingCents: 2700000,
      usedRatio: 0.1,
      isOver: false,
    });
  });

  it("is not set for All time when the sum is 0", () => {
    const { budget: b } = figuresOf({ repairs: spending, budgets: [budget(2026, 0)] }).cards;
    expect(b.setCents).toBeNull();
  });

  it("is over the budget: the remainder is negative and the ratio is above 1", () => {
    const { budget: b } = figuresOf(
      { repairs: [repair({ id: "r1", costCents: 150000 })], budgets: [budget(2026, 100000)] },
      yearOf(2026),
    ).cards;
    expect(b).toEqual({
      setCents: 100000,
      spentCents: 150000,
      remainingCents: -50000,
      usedRatio: 1.5,
      isOver: true,
    });
  });

  it("is not over when the spend equals the budget", () => {
    const { budget: b } = figuresOf(
      { repairs: [repair({ id: "r1", costCents: 100000 })], budgets: [budget(2026, 100000)] },
      yearOf(2026),
    ).cards;
    expect(b.isOver).toBe(false);
    expect(b.remainingCents).toBe(0);
    expect(b.usedRatio).toBe(1);
  });
});
