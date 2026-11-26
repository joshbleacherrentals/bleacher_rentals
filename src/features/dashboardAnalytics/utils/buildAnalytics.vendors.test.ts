import { describe, expect, it } from "vitest";
import { ALL_TIME, figuresOf, repair, service, vendor, yearOf } from "./analyticsFixture";

// docs/specs/dashboard-analytics-04-data-numbers.md §2.8 and §5: the vendor table (D23, D37, D39).

/** A vendor with one repair worth `cents` of Labor. */
function vendorCase(id: string, name: string, cents: number) {
  return {
    vendor: vendor(id, name),
    repair: repair({ id: `r-${id}`, vendorId: id }),
    service: service({ id: `s-${id}`, repairId: `r-${id}`, laborCents: cents }),
  };
}

function inputsOfCases(cases: ReturnType<typeof vendorCase>[]) {
  return {
    vendors: cases.map((c) => c.vendor),
    repairs: cases.map((c) => c.repair),
    services: cases.map((c) => c.service),
  };
}

describe("the vendor table", () => {
  it("adds Labor and Parts per vendor and leaves tax and freight out", () => {
    const { vendors } = figuresOf({
      vendors: [vendor("v1", "Kaypark")],
      repairs: [repair({ id: "r1", vendorId: "v1" })],
      services: [
        service({
          id: "s1",
          repairId: "r1",
          laborCents: 1000,
          partsCents: 500,
          taxCents: 120,
          freightCents: 80,
        }),
      ],
    });
    expect(vendors.rows).toEqual([
      {
        vendorId: "v1",
        name: "Kaypark",
        workOrders: 1,
        laborCents: 1000,
        partsCents: 500,
        totalCents: 1500,
        share: 1,
      },
    ]);
    expect(vendors.total).toEqual({
      vendorsWithSpend: 1,
      workOrders: 1,
      laborCents: 1000,
      partsCents: 500,
      totalCents: 1500,
      share: 1,
    });
  });

  it("converts Labor and Parts of a CAD repair whole, each once (D37)", () => {
    // Two services of 1 cent of Labor at 0.5: whole, 2 x 0.5 = 1 cent. Per service it would be 2.
    const { vendors } = figuresOf(
      {
        vendors: [vendor("v1", "Kaypark")],
        repairs: [repair({ id: "r1", vendorId: "v1", currency: "CAD" })],
        services: [
          service({ id: "s1", repairId: "r1", laborCents: 1 }),
          service({ id: "s2", repairId: "r1", laborCents: 1 }),
          service({ id: "s3", repairId: "r1", partsCents: 10000 }),
        ],
      },
      ALL_TIME,
      () => 0.5,
    );
    expect(vendors.rows[0]).toMatchObject({ laborCents: 1, partsCents: 5000, totalCents: 5001 });
  });

  it("counts every repair of the vendor as a work order, also one with no Labor and Parts", () => {
    const { vendors } = figuresOf({
      vendors: [vendor("v1", "Kaypark")],
      repairs: [repair({ id: "r1", vendorId: "v1" }), repair({ id: "r2", vendorId: "v1" })],
      services: [
        service({ id: "s1", repairId: "r1", laborCents: 1000 }),
        service({ id: "s2", repairId: "r2", taxCents: 90 }),
      ],
    });
    expect(vendors.rows[0]).toMatchObject({ workOrders: 2, totalCents: 1000 });
    expect(vendors.total.workOrders).toBe(2);
  });

  it("leaves a vendor with only tax and freight out of the rows and the total", () => {
    const { vendors } = figuresOf({
      vendors: [vendor("v1", "Kaypark"), vendor("v2", "Acme")],
      repairs: [repair({ id: "r1", vendorId: "v1" }), repair({ id: "r2", vendorId: "v2" })],
      services: [
        service({ id: "s1", repairId: "r1", laborCents: 400 }),
        service({ id: "s2", repairId: "r2", taxCents: 90, freightCents: 10 }),
      ],
    });
    expect(vendors.rows.map((r) => r.vendorId)).toEqual(["v1"]);
    expect(vendors.total.vendorsWithSpend).toBe(1);
    expect(vendors.total.workOrders).toBe(1);
  });

  it("leaves a repair with no vendor, or with an unknown vendor, out: there is no No vendor row", () => {
    const { vendors } = figuresOf({
      vendors: [vendor("v1", "Kaypark")],
      repairs: [
        repair({ id: "r1", vendorId: "v1" }),
        repair({ id: "r2", vendorId: null }),
        repair({ id: "r3", vendorId: "no-such-vendor" }),
      ],
      services: [
        service({ id: "s1", repairId: "r1", laborCents: 100 }),
        service({ id: "s2", repairId: "r2", laborCents: 9000 }),
        service({ id: "s3", repairId: "r3", laborCents: 9000 }),
      ],
    });
    expect(vendors.rows.map((r) => r.vendorId)).toEqual(["v1"]);
    expect(vendors.total.totalCents).toBe(100);
  });

  it("keeps the six vendors with the most Labor and Parts, and totals over every vendor with spend", () => {
    const cases = [800, 700, 600, 500, 400, 300, 200, 100].map((cents, i) =>
      vendorCase(`v${i + 1}`, `Vendor ${i + 1}`, cents),
    );
    const { vendors } = figuresOf(inputsOfCases(cases));
    expect(vendors.rows.map((r) => [r.vendorId, r.totalCents])).toEqual([
      ["v1", 800],
      ["v2", 700],
      ["v3", 600],
      ["v4", 500],
      ["v5", 400],
      ["v6", 300],
    ]);
    // The total is over all eight (3600), the share of a row is over the same total.
    expect(vendors.total).toEqual({
      vendorsWithSpend: 8,
      workOrders: 8,
      laborCents: 3600,
      partsCents: 0,
      totalCents: 3600,
      share: 1,
    });
    expect(vendors.rows[0].share).toBe(800 / 3600);
    const sixShares = vendors.rows.reduce((sum, r) => sum + r.share, 0);
    expect(sixShares).toBeCloseTo(3300 / 3600, 10);
    expect(sixShares).toBeLessThan(1);
  });

  it("breaks a tie by name A to Z (D39), with numbers in their natural order", () => {
    const names = [
      "Vendor 10",
      "Vendor 2",
      "vendor 1",
      "Vendor 3",
      "Vendor 4",
      "Vendor 5",
      "Vendor 6",
    ];
    const cases = names.map((name, i) => vendorCase(`v${i}`, name, 1000));
    const { vendors } = figuresOf(inputsOfCases(cases));
    expect(vendors.rows.map((r) => r.name)).toEqual([
      "vendor 1",
      "Vendor 2",
      "Vendor 3",
      "Vendor 4",
      "Vendor 5",
      "Vendor 6",
    ]);
    expect(vendors.total.vendorsWithSpend).toBe(7);
  });

  it("follows the year", () => {
    const inputs = {
      vendors: [vendor("v1", "Kaypark")],
      repairs: [
        repair({ id: "r1", vendorId: "v1", eventStart: "2025-01-01" }),
        repair({ id: "r2", vendorId: "v1", eventStart: "2026-01-01" }),
      ],
      services: [
        service({ id: "s1", repairId: "r1", laborCents: 100 }),
        service({ id: "s2", repairId: "r2", laborCents: 900 }),
      ],
    };
    expect(figuresOf(inputs, yearOf(2026)).vendors.rows[0]).toMatchObject({
      workOrders: 1,
      totalCents: 900,
    });
    expect(figuresOf(inputs, ALL_TIME).vendors.rows[0]).toMatchObject({
      workOrders: 2,
      totalCents: 1000,
    });
  });

  it("is empty, with a total of zeros, when no vendor has spend", () => {
    expect(figuresOf({}).vendors).toEqual({
      rows: [],
      total: {
        vendorsWithSpend: 0,
        workOrders: 0,
        laborCents: 0,
        partsCents: 0,
        totalCents: 0,
        share: 0,
      },
    });
  });
});
