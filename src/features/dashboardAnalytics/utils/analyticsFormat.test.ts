import { describe, expect, it } from "vitest";
import { formatPercent, formatUsd, formatUsdWhole } from "./analyticsFormat";

// docs/specs/dashboard-analytics-05-page.md §3 and §6: how the page writes money and percents.

describe("formatUsd", () => {
  it("writes cents with two decimals and a dollar sign", () => {
    expect(formatUsd(123456)).toBe("$1,234.56");
    expect(formatUsd(100)).toBe("$1.00");
    expect(formatUsd(5)).toBe("$0.05");
  });

  it("groups thousands with commas", () => {
    expect(formatUsd(100000000)).toBe("$1,000,000.00");
    expect(formatUsd(99999)).toBe("$999.99");
    expect(formatUsd(100000)).toBe("$1,000.00");
  });

  it("puts the minus before the dollar sign", () => {
    expect(formatUsd(-494600)).toBe("-$4,946.00");
    expect(formatUsd(-5)).toBe("-$0.05");
  });

  it("writes zero as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatUsdWhole", () => {
  it("rounds to a whole dollar", () => {
    expect(formatUsdWhole(123456)).toBe("$1,235");
    expect(formatUsdWhole(123449)).toBe("$1,234");
    expect(formatUsdWhole(3120000)).toBe("$31,200");
  });

  it("rounds a half up", () => {
    expect(formatUsdWhole(123450)).toBe("$1,235");
    expect(formatUsdWhole(50)).toBe("$1");
    expect(formatUsdWhole(49)).toBe("$0");
  });

  it("puts the minus before the dollar sign", () => {
    expect(formatUsdWhole(-494600)).toBe("-$4,946");
  });

  it("writes zero as $0", () => {
    expect(formatUsdWhole(0)).toBe("$0");
  });
});

describe("formatPercent", () => {
  it("writes one decimal", () => {
    expect(formatPercent(0.195)).toBe("19.5%");
    expect(formatPercent(0.9792)).toBe("97.9%");
    expect(formatPercent(1)).toBe("100.0%");
  });

  it("goes over 100%", () => {
    expect(formatPercent(1.145)).toBe("114.5%");
  });

  it("writes zero as 0.0%", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });
});
