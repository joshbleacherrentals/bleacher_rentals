import { describe, expect, it } from "vitest";
import { chartScale, formatTick } from "./chartScale";

// docs/specs/dashboard-analytics-05-page.md §2.6 and §6: the vertical scale of the category chart.

describe("chartScale", () => {
  it("takes the step 5000 for a greatest column of $11,206.35", () => {
    expect(chartScale(1120635)).toEqual({ topDollars: 15000, ticks: [0, 5000, 10000, 15000] });
  });

  it("takes the step 500 for $480 and stops at $500", () => {
    expect(chartScale(48000)).toEqual({ topDollars: 500, ticks: [0, 500] });
  });

  it("uses the last step, 100000, when no step fits and goes up to the next whole step", () => {
    const scale = chartScale(90000000);
    expect(scale.topDollars).toBe(900000);
    expect(scale.ticks).toEqual([
      0, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000,
    ]);
  });

  it("keeps a column that is exactly 4 steps on the step", () => {
    expect(chartScale(200000)).toEqual({ topDollars: 2000, ticks: [0, 500, 1000, 1500, 2000] });
  });

  it("moves to the next step when the column is just over 4 steps", () => {
    expect(chartScale(200100)).toEqual({ topDollars: 3000, ticks: [0, 1000, 2000, 3000] });
  });

  it("walks the steps 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000", () => {
    const stepOf = (dollars: number) => chartScale(dollars * 100).ticks[1];
    expect(stepOf(2000)).toBe(500);
    expect(stepOf(4000)).toBe(1000);
    expect(stepOf(8000)).toBe(2000);
    expect(stepOf(10000)).toBe(2500);
    expect(stepOf(20000)).toBe(5000);
    expect(stepOf(40000)).toBe(10000);
    expect(stepOf(80000)).toBe(20000);
    expect(stepOf(100000)).toBe(25000);
    expect(stepOf(200000)).toBe(50000);
    expect(stepOf(400000)).toBe(100000);
  });

  it("gives the axis 0 and one step of 500 for a zero maximum", () => {
    expect(chartScale(0)).toEqual({ topDollars: 500, ticks: [0, 500] });
  });

  it("always starts the ticks at 0 and ends them at the top", () => {
    for (const cents of [1, 99, 480000, 1234567, 99999999]) {
      const { topDollars, ticks } = chartScale(cents);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBe(topDollars);
      expect(topDollars * 100).toBeGreaterThanOrEqual(cents);
    }
  });
});

describe("formatTick", () => {
  it("writes a tick below 1000 as dollars", () => {
    expect(formatTick(0)).toBe("$0");
    expect(formatTick(500)).toBe("$500");
  });

  it("writes a tick of 1000 or more as thousands with k", () => {
    expect(formatTick(1000)).toBe("$1k");
    expect(formatTick(2500)).toBe("$2.5k");
    expect(formatTick(15000)).toBe("$15k");
    expect(formatTick(100000)).toBe("$100k");
  });
});
