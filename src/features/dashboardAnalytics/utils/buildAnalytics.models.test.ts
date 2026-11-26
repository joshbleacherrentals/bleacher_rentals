import { describe, expect, it } from "vitest";
import { ALL_TIME, bleacher, figuresOf, repair, service, yearOf } from "./analyticsFixture";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.6 and §5: Top High-Cost Models.

/** One repair of one bleacher of one model, worth `cents` of Labor. */
function modelCase(model: string, index: number, cents: number) {
  const id = `${model}-${index}`;
  return {
    bleacher: bleacher({ id: `b-${id}`, modelNumber: model }),
    repair: repair({ id: `r-${id}` }),
    service: service({
      id: `s-${id}`,
      repairId: `r-${id}`,
      bleacherId: `b-${id}`,
      laborCents: cents,
    }),
    link: { repairId: `r-${id}`, bleacherId: `b-${id}` },
  };
}

function inputsOfCases(cases: ReturnType<typeof modelCase>[]) {
  return {
    bleachers: cases.map((c) => c.bleacher),
    repairs: cases.map((c) => c.repair),
    services: cases.map((c) => c.service),
    repairBleachers: cases.map((c) => c.link),
  };
}

describe("Top High-Cost Models", () => {
  it("says there is no model number when no live bleacher has one", () => {
    const { models } = figuresOf({
      bleachers: [bleacher({ id: "b1" }), bleacher({ id: "b2", modelNumber: "   " })],
      repairs: [repair({ id: "r1", costCents: 500 })],
      repairBleachers: [{ repairId: "r1", bleacherId: "b1" }],
    });
    expect(models).toEqual({ hasModelNumbers: false, rows: [], total: null });
  });

  it("has model numbers but no row when no repair of the period touches them", () => {
    const { models } = figuresOf(
      {
        bleachers: [bleacher({ id: "b1", modelNumber: "M1" })],
        repairs: [repair({ id: "r1", eventStart: "2025-01-01", costCents: 500 })],
        repairBleachers: [{ repairId: "r1", bleacherId: "b1" }],
      },
      yearOf(2026),
    );
    expect(models).toEqual({ hasModelNumbers: true, rows: [], total: null });
  });

  it("trims a model number, counts its units, repairs and cost, and gives the total row", () => {
    const { models } = figuresOf({
      bleachers: [
        bleacher({ id: "b1", modelNumber: "M1" }),
        bleacher({ id: "b2", modelNumber: "  M1 " }),
        bleacher({ id: "b3", modelNumber: "M2" }),
        bleacher({ id: "b4" }),
      ],
      repairs: [repair({ id: "r1" }), repair({ id: "r2" }), repair({ id: "r3" })],
      services: [
        service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 1000 }),
        service({ id: "s2", repairId: "r1", bleacherId: "b2", laborCents: 2000 }),
        service({ id: "s3", repairId: "r2", bleacherId: "b2", partsCents: 500 }),
        service({ id: "s4", repairId: "r3", bleacherId: "b3", laborCents: 100 }),
      ],
      repairBleachers: [
        { repairId: "r1", bleacherId: "b1" },
        { repairId: "r1", bleacherId: "b2" },
        { repairId: "r2", bleacherId: "b2" },
        { repairId: "r3", bleacherId: "b3" },
      ],
    });
    expect(models.hasModelNumbers).toBe(true);
    expect(models.rows).toEqual([
      { rank: 1, model: "M1", units: 2, avgCostCents: 1750, repairs: 2, costCents: 3500 },
      { rank: 2, model: "M2", units: 1, avgCostCents: 100, repairs: 1, costCents: 100 },
    ]);
    expect(models.total).toEqual({ units: 3, avgCostCents: 1200, repairs: 3, costCents: 3600 });
  });

  it("treats a model typed with another case as another model (the stored text, trimmed)", () => {
    const { models } = figuresOf(
      inputsOfCases([modelCase("TSP15-450", 1, 100), modelCase("tsp15-450", 1, 200)]),
    );
    expect(models.rows.map((r) => r.model)).toEqual(["tsp15-450", "TSP15-450"]);
  });

  it("keeps the five models with the biggest cost, ranked 1 to 5", () => {
    const cases = [1, 2, 3, 4, 5, 6, 7].map((n) => modelCase(`M${n}`, 1, n * 100));
    const { models } = figuresOf(inputsOfCases(cases));
    expect(models.rows.map((r) => [r.rank, r.model, r.costCents])).toEqual([
      [1, "M7", 700],
      [2, "M6", 600],
      [3, "M5", 500],
      [4, "M4", 400],
      [5, "M3", 300],
    ]);
    expect(models.total).toEqual({ units: 5, avgCostCents: 500, repairs: 5, costCents: 2500 });
  });

  it("breaks a tie by name A to Z, with numbers in their natural order (D39)", () => {
    const names = ["Model 10", "Model 2", "model 1", "Model 3", "Model 4", "Model 5"];
    const { models } = figuresOf(inputsOfCases(names.map((m) => modelCase(m, 1, 1000))));
    expect(models.rows.map((r) => r.model)).toEqual([
      "model 1",
      "Model 2",
      "Model 3",
      "Model 4",
      "Model 5",
    ]);
  });

  it("leaves a model with no repair in the period out, and a bleacher with no model out", () => {
    const { models } = figuresOf(
      {
        bleachers: [
          bleacher({ id: "b1", modelNumber: "M1" }),
          bleacher({ id: "b2", modelNumber: "M2" }),
          bleacher({ id: "b3" }),
        ],
        repairs: [
          repair({ id: "r1", eventStart: "2026-02-02" }),
          repair({ id: "r2", eventStart: "2025-02-02" }),
          repair({ id: "r3", eventStart: "2026-02-03" }),
        ],
        services: [
          service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 100 }),
          service({ id: "s2", repairId: "r2", bleacherId: "b2", laborCents: 900 }),
          service({ id: "s3", repairId: "r3", bleacherId: "b3", laborCents: 400 }),
        ],
        repairBleachers: [
          { repairId: "r1", bleacherId: "b1" },
          { repairId: "r2", bleacherId: "b2" },
          { repairId: "r3", bleacherId: "b3" },
        ],
      },
      yearOf(2026),
    );
    expect(models.rows.map((r) => r.model)).toEqual(["M1"]);
  });

  it("counts the repairs through the list of bleachers and the cost through the services (D36)", () => {
    const { models } = figuresOf({
      bleachers: [
        bleacher({ id: "b1", modelNumber: "M1" }),
        bleacher({ id: "b2", modelNumber: "M2" }),
      ],
      repairs: [repair({ id: "r1" })],
      // The list holds b1, the service is on b2: M1 has the repair and no cost, M2 has the cost and
      // no repair, so M2 is not a candidate.
      services: [service({ id: "s1", repairId: "r1", bleacherId: "b2", laborCents: 500 })],
      repairBleachers: [{ repairId: "r1", bleacherId: "b1" }],
    });
    expect(models.rows).toEqual([
      { rank: 1, model: "M1", units: 1, avgCostCents: 0, repairs: 1, costCents: 0 },
    ]);
  });

  it("counts a repair that holds bleachers of two models in both rows, and once in a model", () => {
    const { models } = figuresOf({
      bleachers: [
        bleacher({ id: "b1", modelNumber: "M1" }),
        bleacher({ id: "b2", modelNumber: "M1" }),
        bleacher({ id: "b3", modelNumber: "M2" }),
      ],
      repairs: [repair({ id: "r1" })],
      services: [
        service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 300 }),
        service({ id: "s2", repairId: "r1", bleacherId: "b2", laborCents: 200 }),
        service({ id: "s3", repairId: "r1", bleacherId: "b3", laborCents: 100 }),
      ],
      repairBleachers: [
        { repairId: "r1", bleacherId: "b1" },
        { repairId: "r1", bleacherId: "b2" },
        { repairId: "r1", bleacherId: "b3" },
      ],
    });
    expect(models.rows.map((r) => [r.model, r.repairs, r.costCents])).toEqual([
      ["M1", 1, 500],
      ["M2", 1, 100],
    ]);
    expect(models.total).toMatchObject({ repairs: 2, costCents: 600 });
  });

  it("converts the services of a CAD repair and leaves a CAD repair with no rate out", () => {
    const inputs = {
      bleachers: [bleacher({ id: "b1", modelNumber: "M1" })],
      repairs: [repair({ id: "r1", currency: "CAD" })],
      services: [service({ id: "s1", repairId: "r1", bleacherId: "b1", laborCents: 10000 })],
      repairBleachers: [{ repairId: "r1", bleacherId: "b1" }],
    };
    expect(figuresOf(inputs, ALL_TIME, () => 0.7).models.rows[0]).toMatchObject({
      costCents: 7000,
      repairs: 1,
    });
    expect(figuresOf(inputs, ALL_TIME).models).toEqual({
      hasModelNumbers: true,
      rows: [],
      total: null,
    });
  });

  it("ignores a bleacher of a repair's list that is not live", () => {
    const { models } = figuresOf({
      bleachers: [bleacher({ id: "b1", modelNumber: "M1" })],
      repairs: [repair({ id: "r1" })],
      repairBleachers: [{ repairId: "r1", bleacherId: "deleted-bleacher" }],
    });
    expect(models.rows).toEqual([]);
  });
});
