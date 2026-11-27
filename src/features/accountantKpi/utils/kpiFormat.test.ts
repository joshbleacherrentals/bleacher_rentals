import { describe, expect, it } from "vitest";
import { KPI_DASH, formatDays, formatPaymentCount } from "./kpiFormat";

// docs/specs/accountant-kpi.md §1 (C11), §2.4: `10 days`, `1 day`, `3 payments`, `1 payment`, a dash.

describe("formatDays", () => {
  it("writes the number and the unit, singular for exactly one", () => {
    expect(formatDays(10)).toBe("10 days");
    expect(formatDays(2)).toBe("2 days");
    expect(formatDays(1)).toBe("1 day");
  });

  it("0 days is a value, written out", () => {
    expect(formatDays(0)).toBe("0 days");
  });

  it("nothing to average is a dash", () => {
    expect(formatDays(null)).toBe(KPI_DASH);
    expect(KPI_DASH).toBe("–");
  });
});

describe("formatPaymentCount", () => {
  it("writes the count and the unit, singular for exactly one", () => {
    expect(formatPaymentCount(3)).toBe("3 payments");
    expect(formatPaymentCount(12)).toBe("12 payments");
    expect(formatPaymentCount(1)).toBe("1 payment");
  });

  it("zero is plural", () => {
    expect(formatPaymentCount(0)).toBe("0 payments");
  });
});
