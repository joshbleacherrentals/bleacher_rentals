import { describe, expect, it } from "vitest";
import {
  ALL_TIME,
  bleacher,
  category,
  figuresOf,
  repair,
  service,
  vendor,
  yearOf,
  zone,
} from "./analyticsFixture";

// docs/specs/dashboard-analytics-04-data-numbers.md §5 "reconciliation": the tables agree with the
// cards. D37 converts a CAD repair whole and R2 converts a service alone, so a row built from
// services may differ from a card by a few cents. Nothing else may differ.

const rateFor = (day: string) => (day < "2026-04-01" ? 0.7 : 0.74);

const mixed = {
  zones: [zone("z1", "Zone 1"), zone("z2", "Zone 2")],
  vendors: [vendor("v1", "Kaypark"), vendor("v2", "Acme")],
  categories: [category("c1", "Welding"), category("c2", "Tires")],
  bleachers: [
    bleacher({ id: "b1", zoneId: "z1" }),
    bleacher({ id: "b2", zoneId: "z2" }),
    bleacher({ id: "b3" }),
  ],
  repairs: [
    repair({ id: "r1", zoneId: "z1", vendorId: "v1" }),
    repair({ id: "r2", zoneId: "z2", vendorId: "v2", currency: "CAD", eventStart: "2026-03-05" }),
    repair({ id: "r3", zoneId: "z2", vendorId: "v1", currency: "CAD", eventStart: "2026-05-05" }),
    repair({ id: "r4", status: "completed", vendorId: null }),
    repair({ id: "r5", eventStart: "2025-08-08", zoneId: "z1", vendorId: "v2" }),
  ],
  services: [
    service({
      id: "s1",
      repairId: "r1",
      bleacherId: "b1",
      categoryId: "c1",
      laborCents: 12345,
      partsCents: 678,
      taxCents: 91,
      freightCents: 12,
    }),
    service({
      id: "s2",
      repairId: "r2",
      bleacherId: "b2",
      categoryId: "c2",
      laborCents: 3333,
      partsCents: 1111,
      taxCents: 7,
    }),
    service({
      id: "s3",
      repairId: "r2",
      bleacherId: "b2",
      categoryId: "c1",
      laborCents: 3333,
      freightCents: 5,
    }),
    service({
      id: "s4",
      repairId: "r3",
      bleacherId: "b3",
      categoryId: null,
      laborCents: 4999,
      partsCents: 1,
    }),
    service({ id: "s5", repairId: "r4", bleacherId: "b1", categoryId: "c2", partsCents: 250 }),
    service({ id: "s6", repairId: "r5", bleacherId: "b1", categoryId: "c1", laborCents: 777 }),
  ],
  repairBleachers: [
    { repairId: "r1", bleacherId: "b1" },
    { repairId: "r2", bleacherId: "b2" },
    { repairId: "r3", bleacherId: "b3" },
    { repairId: "r5", bleacherId: "b1" },
  ],
};

describe("the figures of the page agree with each other", () => {
  for (const [label, period] of [
    ["All time", ALL_TIME],
    ["2026", yearOf(2026)],
    ["2025", yearOf(2025)],
  ] as const) {
    it(`${label}: the zone costs add up to the total spend, to the cent`, () => {
      const { zones, cards } = figuresOf(mixed, period, rateFor);
      const sum = zones.rows.reduce((total, row) => total + row.costCents, 0);
      expect(sum).toBe(cards.totalSpendCents);
      expect(zones.total.costCents).toBe(cards.totalSpendCents);
    });

    it(`${label}: the vendor total is at most the total spend`, () => {
      const { vendors, cards } = figuresOf(mixed, period, rateFor);
      expect(vendors.total.totalCents).toBeLessThanOrEqual(cards.totalSpendCents);
    });

    it(`${label}: the category total is within a cent per service of the total spend`, () => {
      const { categories, cards } = figuresOf(mixed, period, rateFor);
      const services = mixed.services.length;
      expect(Math.abs(categories.total.expenseCents - cards.totalSpendCents)).toBeLessThanOrEqual(
        services,
      );
    });
  }

  it("a USD-only dataset agrees exactly in every table", () => {
    const usd = {
      ...mixed,
      repairs: mixed.repairs.map((r) => ({ ...r, currency: "USD" as const })),
    };
    const { categories, cards, zones } = figuresOf(usd, ALL_TIME, () => null);
    expect(categories.total.expenseCents).toBe(cards.totalSpendCents);
    expect(zones.total.costCents).toBe(cards.totalSpendCents);
  });

  it("shows the expected cent between the tables for a CAD repair of three small services", () => {
    // 3 services of 1 cent at 0.5: the card converts the repair whole (3 x 0.5 = 1.5 -> 2), the
    // category rows convert each service (0.5 -> 1, three times -> 3). D37 accepts this cent.
    const { categories, cards } = figuresOf(
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
    expect(categories.total.expenseCents).toBe(3);
  });
});
