import { describe, expect, it } from "vitest";
import { ALL_TIME, category, figuresOf, repair, service, vendor, yearOf } from "./analyticsFixture";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.7 and §5: the category table (D21, D38, R1).

describe("the category table: which rows", () => {
  it("lists every active category, also with no spend, and an Unassigned row last", () => {
    const { categories } = figuresOf({
      categories: [category("c1", "Welding"), category("c2", "Tires")],
    });
    expect(categories.rows.map((r) => r.name)).toEqual(["Tires", "Welding", "Unassigned"]);
    expect(categories.rows.map((r) => r.categoryId)).toEqual(["c2", "c1", null]);
    for (const row of categories.rows) {
      expect(row).toMatchObject({
        repairs: 0,
        expenseCents: 0,
        avgCostCents: 0,
        share: 0,
        topVendor: null,
      });
    }
    expect(categories.total).toEqual({ repairs: 0, expenseCents: 0, avgCostCents: 0, share: 0 });
  });

  it("lists an inactive category only when it has spend in the period", () => {
    const { categories } = figuresOf({
      categories: [
        category("c1", "Welding"),
        category("c3", "Old", false),
        category("c4", "Paint", false),
      ],
      repairs: [repair({ id: "r1" })],
      services: [service({ id: "s1", repairId: "r1", categoryId: "c4", laborCents: 500 })],
    });
    expect(categories.rows.map((r) => r.name)).toEqual(["Paint", "Welding", "Unassigned"]);
  });

  it("does not list an inactive category whose spend is in another year", () => {
    const { categories } = figuresOf(
      {
        categories: [category("c4", "Paint", false)],
        repairs: [repair({ id: "r1", eventStart: "2025-01-01" })],
        services: [service({ id: "s1", repairId: "r1", categoryId: "c4", laborCents: 500 })],
      },
      yearOf(2026),
    );
    expect(categories.rows.map((r) => r.name)).toEqual(["Unassigned"]);
  });

  it("makes the stored category named Unassigned, a service with no category and a service with a missing category one row", () => {
    const { categories } = figuresOf({
      categories: [category("c5", "  unassigned "), category("c1", "Welding")],
      repairs: [repair({ id: "r1" }), repair({ id: "r2" }), repair({ id: "r3" })],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c5", laborCents: 100 }),
        service({ id: "s2", repairId: "r1", categoryId: null, laborCents: 200 }),
        service({ id: "s3", repairId: "r2", categoryId: "ghost", laborCents: 400 }),
        service({ id: "s4", repairId: "r3", categoryId: "c1", laborCents: 50 }),
      ],
    });
    expect(categories.rows.filter((r) => r.categoryId === null)).toHaveLength(1);
    expect(categories.rows.map((r) => [r.name, r.repairs, r.expenseCents])).toEqual([
      ["Welding", 1, 50],
      ["Unassigned", 2, 700],
    ]);
  });

  it("puts a repair with no services into Unassigned with its stored cost_cents (R3)", () => {
    const { categories } = figuresOf({
      categories: [category("c1", "Welding")],
      repairs: [repair({ id: "r1", costCents: 700 })],
    });
    expect(categories.rows.at(-1)).toMatchObject({
      categoryId: null,
      repairs: 1,
      expenseCents: 700,
    });
  });

  it("converts the cost_cents of a CAD repair with no services whole", () => {
    const { categories } = figuresOf(
      { repairs: [repair({ id: "r1", currency: "CAD", costCents: 1001 })] },
      ALL_TIME,
      () => 0.5,
    );
    expect(categories.rows.at(-1)!.expenseCents).toBe(501);
  });

  it("leaves a CAD repair with no rate out", () => {
    const { categories } = figuresOf({
      categories: [category("c1", "Welding")],
      repairs: [repair({ id: "r1", currency: "CAD" })],
      services: [service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 900 })],
    });
    expect(categories.rows.map((r) => r.expenseCents)).toEqual([0, 0]);
    expect(categories.total.repairs).toBe(0);
  });
});

describe("the category table: the figures of a row", () => {
  it("counts a repair with services in two categories in both rows, and the total shows it (D21)", () => {
    const { categories } = figuresOf({
      categories: [category("c1", "Welding"), category("c2", "Tires")],
      repairs: [repair({ id: "r1" })],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 1000 }),
        service({ id: "s2", repairId: "r1", categoryId: "c1", partsCents: 200 }),
        service({ id: "s3", repairId: "r1", categoryId: "c2", taxCents: 500 }),
      ],
    });
    expect(categories.rows.map((r) => [r.name, r.repairs, r.expenseCents])).toEqual([
      ["Welding", 1, 1200],
      ["Tires", 1, 500],
      ["Unassigned", 0, 0],
    ]);
    // One repair, two rows: the sum of the rows is 2.
    expect(categories.total.repairs).toBe(2);
    expect(categories.total.expenseCents).toBe(1700);
  });

  it("gives the average of a row and a share over the sum of the rows (R5)", () => {
    const { categories } = figuresOf({
      categories: [category("c1", "Welding"), category("c2", "Tires")],
      repairs: [repair({ id: "r1" }), repair({ id: "r2" })],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 400 }),
        service({ id: "s2", repairId: "r2", categoryId: "c1", laborCents: 600 }),
        service({ id: "s3", repairId: "r2", categoryId: "c2", laborCents: 1000 }),
      ],
    });
    const welding = categories.rows.find((r) => r.name === "Welding")!;
    const tires = categories.rows.find((r) => r.name === "Tires")!;
    expect(welding).toMatchObject({
      repairs: 2,
      expenseCents: 1000,
      avgCostCents: 500,
      share: 0.5,
    });
    expect(tires).toMatchObject({ repairs: 1, expenseCents: 1000, avgCostCents: 1000, share: 0.5 });
    expect(categories.total).toEqual({
      repairs: 3,
      expenseCents: 2000,
      avgCostCents: Math.round(2000 / 3),
      share: 1,
    });
  });

  it("converts the services of a CAD repair at the rate of the repair (R2)", () => {
    const { categories } = figuresOf(
      {
        categories: [category("c1", "Welding")],
        repairs: [repair({ id: "r1", currency: "CAD" })],
        services: [service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 10000 })],
      },
      ALL_TIME,
      () => 0.7,
    );
    expect(categories.rows[0]).toMatchObject({ name: "Welding", expenseCents: 7000 });
  });

  it("follows the year", () => {
    const inputs = {
      categories: [category("c1", "Welding")],
      repairs: [
        repair({ id: "r1", eventStart: "2025-06-01" }),
        repair({ id: "r2", eventStart: "2026-06-01" }),
      ],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 100 }),
        service({ id: "s2", repairId: "r2", categoryId: "c1", laborCents: 900 }),
      ],
    };
    expect(figuresOf(inputs, yearOf(2026)).categories.rows[0].expenseCents).toBe(900);
    expect(figuresOf(inputs, yearOf(2025)).categories.rows[0].expenseCents).toBe(100);
    expect(figuresOf(inputs, ALL_TIME).categories.rows[0].expenseCents).toBe(1000);
  });
});

describe("the category table: the order (D38, R1)", () => {
  it("lists the biggest spend first, ties by name, then the rows with no spend by name, and Unassigned last", () => {
    const { categories } = figuresOf({
      categories: [
        category("c1", "Welding"),
        category("c2", "Tires"),
        category("c3", "Axles"),
        category("c4", "Zinc"),
        category("c5", "Brakes"),
      ],
      repairs: [repair({ id: "r1" }), repair({ id: "r2" })],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 500 }),
        service({ id: "s2", repairId: "r1", categoryId: "c2", laborCents: 500 }),
        service({ id: "s3", repairId: "r1", categoryId: "c3", laborCents: 900 }),
        // The biggest spend of all is Unassigned, and it still comes last.
        service({ id: "s4", repairId: "r2", categoryId: null, laborCents: 5000 }),
      ],
    });
    expect(categories.rows.map((r) => r.name)).toEqual([
      "Axles",
      "Tires",
      "Welding",
      "Brakes",
      "Zinc",
      "Unassigned",
    ]);
  });
});

describe("the category table: the top vendor of a row", () => {
  const vendors = [vendor("v1", "Kaypark"), vendor("v2", "Acme")];
  const categories = [category("c1", "Welding"), category("c2", "Tires")];

  it("is the vendor with the most spend in the row", () => {
    const { categories: table } = figuresOf({
      categories,
      vendors,
      repairs: [
        repair({ id: "r1", vendorId: "v1" }),
        repair({ id: "r2", vendorId: "v2" }),
        repair({ id: "r3", vendorId: null }),
      ],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 700 }),
        service({ id: "s2", repairId: "r2", categoryId: "c1", laborCents: 300 }),
        // A repair with no vendor is not a vendor's spend, however large.
        service({ id: "s3", repairId: "r3", categoryId: "c1", laborCents: 9000 }),
      ],
    });
    expect(table.rows.find((r) => r.name === "Welding")!.topVendor).toBe("Kaypark");
  });

  it("is the first name A to Z when two vendors are equal (R1)", () => {
    const { categories: table } = figuresOf({
      categories,
      vendors,
      repairs: [repair({ id: "r1", vendorId: "v1" }), repair({ id: "r2", vendorId: "v2" })],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 500 }),
        service({ id: "s2", repairId: "r2", categoryId: "c1", laborCents: 500 }),
      ],
    });
    expect(table.rows.find((r) => r.name === "Welding")!.topVendor).toBe("Acme");
  });

  it("is null when no vendor has spend above 0", () => {
    const { categories: table } = figuresOf({
      categories,
      vendors,
      repairs: [repair({ id: "r1", vendorId: "v1" }), repair({ id: "r2" })],
      services: [
        service({ id: "s1", repairId: "r1", categoryId: "c1" }),
        service({ id: "s2", repairId: "r2", categoryId: "c2", laborCents: 400 }),
      ],
    });
    expect(table.rows.find((r) => r.name === "Welding")!.topVendor).toBeNull();
    expect(table.rows.find((r) => r.name === "Tires")!.topVendor).toBeNull();
  });

  it("is null for a repair whose vendor is not in the list of vendors", () => {
    const { categories: table } = figuresOf({
      categories,
      vendors,
      repairs: [repair({ id: "r1", vendorId: "no-such-vendor" })],
      services: [service({ id: "s1", repairId: "r1", categoryId: "c1", laborCents: 400 })],
    });
    expect(table.rows.find((r) => r.name === "Welding")!.topVendor).toBeNull();
  });

  it("counts the cost_cents of a repair with no services toward the vendor of Unassigned", () => {
    const { categories: table } = figuresOf({
      categories,
      vendors,
      repairs: [repair({ id: "r1", vendorId: "v2", costCents: 400 })],
    });
    expect(table.rows.at(-1)).toMatchObject({ categoryId: null, topVendor: "Acme" });
  });
});
