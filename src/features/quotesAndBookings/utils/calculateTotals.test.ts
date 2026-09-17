import { describe, it, expect } from "vitest";
import { calculateTotals } from "./calculateTotals";
import { LineItem } from "../types/quoteTypes";

const makeLineItem = (overrides: Partial<LineItem>): LineItem => ({
  id: "1",
  category: "bleachers",
  label: "Test",
  bleacherTypeUuid: null,
  qty: 1,
  unitPriceCents: 0,
  lineTotalCents: 0,
  description: null,
  overridePrice: false,
  discountType: "percentage",
  discountValue: 0,
  ...overrides,
});

describe("calculateTotals", () => {
  it("returns zeros for empty line items", () => {
    const result = calculateTotals([], null);
    expect(result).toEqual({
      subtotal: 0,
      discountTotal: 0,
      taxableAmount: 0,
      taxAmount: 0,
      total: 0,
    });
  });

  it("calculates subtotal from non-discount items", () => {
    const items = [
      makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 5000 }),
      makeLineItem({ id: "2", category: "logistics", lineTotalCents: 650 }),
      makeLineItem({ id: "3", category: "custom_service", lineTotalCents: 800 }),
    ];
    const result = calculateTotals(items, null);
    expect(result.subtotal).toBe(6450);
    expect(result.discountTotal).toBe(0);
    expect(result.total).toBe(6450);
  });

  it("applies tax percent to taxable amount", () => {
    const items = [makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 10000 })];
    const result = calculateTotals(items, 8.25);
    expect(result.subtotal).toBe(10000);
    expect(result.taxAmount).toBe(825);
    expect(result.total).toBe(10825);
  });

  it("discounts reduce taxable amount", () => {
    const items = [
      makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 10000 }),
      makeLineItem({ id: "2", category: "discounts", lineTotalCents: -1000 }),
    ];
    const result = calculateTotals(items, 10);
    expect(result.subtotal).toBe(10000);
    expect(result.discountTotal).toBe(-1000);
    expect(result.taxableAmount).toBe(9000);
    expect(result.taxAmount).toBe(900);
    expect(result.total).toBe(9900);
  });

  it("handles null taxPercent as 0%", () => {
    const items = [makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 5000 })];
    const result = calculateTotals(items, null);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(5000);
  });

  it("handles 0% tax", () => {
    const items = [makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 5000 })];
    const result = calculateTotals(items, 0);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(5000);
  });

  it("handles Canadian HST (13%)", () => {
    const items = [
      makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 7200 }),
      makeLineItem({ id: "2", category: "logistics", lineTotalCents: 650 }),
    ];
    const result = calculateTotals(items, 13);
    expect(result.subtotal).toBe(7850);
    expect(result.taxAmount).toBe(1020.5);
    expect(result.total).toBe(8870.5);
  });

  it("handles fractional tax rate (8.875%)", () => {
    const items = [makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 10000 })];
    const result = calculateTotals(items, 8.875);
    expect(result.taxAmount).toBe(887.5);
    expect(result.total).toBe(10887.5);
  });

  it("handles multiple discounts", () => {
    const items = [
      makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 20000 }),
      makeLineItem({ id: "2", category: "discounts", lineTotalCents: -2000 }),
      makeLineItem({ id: "3", category: "discounts", lineTotalCents: -500 }),
    ];
    const result = calculateTotals(items, 8);
    expect(result.subtotal).toBe(20000);
    expect(result.discountTotal).toBe(-2500);
    expect(result.taxableAmount).toBe(17500);
    expect(result.taxAmount).toBe(1400);
    expect(result.total).toBe(18900);
  });

  it("handles mixed categories with discounts and tax", () => {
    const items = [
      makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 14400 }),
      makeLineItem({ id: "2", category: "bleachers", lineTotalCents: 9000 }),
      makeLineItem({ id: "3", category: "logistics", lineTotalCents: 1300 }),
      makeLineItem({ id: "4", category: "custom_service", lineTotalCents: 800 }),
      makeLineItem({ id: "5", category: "discounts", lineTotalCents: -2550 }),
    ];
    const result = calculateTotals(items, 8.25);

    expect(result.subtotal).toBe(25500);
    expect(result.discountTotal).toBe(-2550);
    expect(result.taxableAmount).toBe(22950);
    expect(result.taxAmount).toBeCloseTo(1893.375);
    expect(result.total).toBeCloseTo(24843.375);
  });

  it("handles all discounts (100% discount)", () => {
    const items = [
      makeLineItem({ id: "1", category: "bleachers", lineTotalCents: 5000 }),
      makeLineItem({ id: "2", category: "discounts", lineTotalCents: -5000 }),
    ];
    const result = calculateTotals(items, 10);
    expect(result.taxableAmount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(0);
  });
});
