import { describe, expect, it } from "vitest";
import {
  convertCents,
  isDay,
  isValidRate,
  makeRateLookup,
  planRatesRequest,
} from "./exchangeRates";

// docs/specs/dashboard-analytics-03-converter.md §2.2, §2.3 and §5.

describe("makeRateLookup", () => {
  const rates = { "2026-03-09": 0.71, "2026-03-06": 0.7, "2026-03-10": 0.72 };

  it("gives the rate of a known day", () => {
    const rateFor = makeRateLookup(rates);
    expect(rateFor("2026-03-06")).toBe(0.7);
    expect(rateFor("2026-03-09")).toBe(0.71);
    expect(rateFor("2026-03-10")).toBe(0.72);
  });

  it("gives the nearest earlier day's rate for a weekend (D6)", () => {
    const rateFor = makeRateLookup(rates);
    expect(rateFor("2026-03-07")).toBe(0.7); // Saturday
    expect(rateFor("2026-03-08")).toBe(0.7); // Sunday
  });

  it("gives null for a day before every known rate (D9)", () => {
    const rateFor = makeRateLookup(rates);
    expect(rateFor("2026-03-05")).toBeNull();
    expect(rateFor("1999-01-01")).toBeNull();
  });

  it("gives the newest rate for a day after the newest known day", () => {
    const rateFor = makeRateLookup(rates);
    expect(rateFor("2026-03-11")).toBe(0.72);
    expect(rateFor("2027-01-01")).toBe(0.72);
  });

  it("gives null for every day when the map is empty", () => {
    const rateFor = makeRateLookup({});
    expect(rateFor("2026-03-06")).toBeNull();
  });

  it("works with one day only", () => {
    const rateFor = makeRateLookup({ "2026-03-06": 0.7 });
    expect(rateFor("2026-03-05")).toBeNull();
    expect(rateFor("2026-03-06")).toBe(0.7);
    expect(rateFor("2026-03-07")).toBe(0.7);
  });

  it("finds the right day in a long map", () => {
    const many: Record<string, number> = {};
    for (let d = 1; d <= 28; d++) {
      many[`2026-02-${String(d).padStart(2, "0")}`] = d / 100;
    }
    const rateFor = makeRateLookup(many);
    for (let d = 1; d <= 28; d++) {
      expect(rateFor(`2026-02-${String(d).padStart(2, "0")}`)).toBe(d / 100);
    }
    expect(rateFor("2026-01-31")).toBeNull();
    expect(rateFor("2026-03-01")).toBe(0.28);
  });
});

describe("convertCents", () => {
  it("rounds to the nearest cent: C$123.50 at 0.70137 is $86.62, not $86.61 (D35)", () => {
    // 12350 * 0.70137 = 8661.9195
    expect(convertCents(12350, 0.70137)).toBe(8662);
  });

  it("rounds a half away from zero", () => {
    expect(convertCents(5, 0.5)).toBe(3); // 2.5
    expect(convertCents(-5, 0.5)).toBe(-3); // -2.5
  });

  it("gives 0 for 0 cents", () => {
    expect(convertCents(0, 0.70137)).toBe(0);
  });

  it("keeps the sign of a negative number", () => {
    expect(convertCents(-12350, 0.70137)).toBe(-8662);
  });

  it("never gives minus zero", () => {
    expect(Object.is(convertCents(-1, 0.1), 0)).toBe(true);
  });

  it("is the same number at rate 1", () => {
    expect(convertCents(12345, 1)).toBe(12345);
  });
});

describe("isDay", () => {
  it("accepts a real day", () => {
    expect(isDay("2026-11-25")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
  });

  it("rejects text that is not a day", () => {
    expect(isDay("2026-11-5")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2027-02-29")).toBe(false);
    expect(isDay("2026-11-25T00:00:00Z")).toBe(false);
    expect(isDay("")).toBe(false);
    expect(isDay("__proto__")).toBe(false);
  });

  it("rejects what is not text", () => {
    expect(isDay(20261125)).toBe(false);
    expect(isDay(null)).toBe(false);
    expect(isDay(undefined)).toBe(false);
  });
});

describe("isValidRate", () => {
  it("accepts a finite number above 0", () => {
    expect(isValidRate(0.70137)).toBe(true);
    expect(isValidRate(1)).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidRate(0)).toBe(false);
    expect(isValidRate(-0.7)).toBe(false);
    expect(isValidRate(Number.NaN)).toBe(false);
    expect(isValidRate(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidRate("0.7")).toBe(false);
    expect(isValidRate(null)).toBe(false);
    expect(isValidRate(undefined)).toBe(false);
  });
});

describe("planRatesRequest", () => {
  const today = "2026-11-25";
  const memory = {
    askedFrom: "2026-11-01",
    rates: { "2026-11-20": 0.69898, "2026-11-23": 0.69626 },
  };

  it("rule 1: asks for nothing when there is no CAD repair", () => {
    expect(planRatesRequest({ memory: null, oldestCadDay: null, today })).toBeNull();
    expect(planRatesRequest({ memory, oldestCadDay: null, today })).toBeNull();
  });

  it("rule 2: asks for the whole range when the memory is empty", () => {
    expect(planRatesRequest({ memory: null, oldestCadDay: "2026-01-05", today })).toEqual({
      from: "2026-01-05",
      to: today,
    });
  });

  it("rule 2: asks for the whole range when the memory holds no rate", () => {
    expect(
      planRatesRequest({
        memory: { askedFrom: "2026-01-01", rates: {} },
        oldestCadDay: "2026-01-05",
        today,
      }),
    ).toEqual({ from: "2026-01-05", to: today });
  });

  it("rule 2: asks for the whole range when the memory does not reach back far enough", () => {
    expect(planRatesRequest({ memory, oldestCadDay: "2026-10-30", today })).toEqual({
      from: "2026-10-30",
      to: today,
    });
  });

  it("rule 2: a CAD repair dated in the future starts the range at today", () => {
    expect(planRatesRequest({ memory: null, oldestCadDay: "2026-12-10", today })).toEqual({
      from: today,
      to: today,
    });
  });

  it("rule 2: a CAD repair of today asks for today", () => {
    expect(planRatesRequest({ memory: null, oldestCadDay: today, today })).toEqual({
      from: today,
      to: today,
    });
  });

  it("rule 3: asks from the day after the newest known day to today (D33)", () => {
    expect(planRatesRequest({ memory, oldestCadDay: "2026-11-05", today })).toEqual({
      from: "2026-11-24",
      to: today,
    });
  });

  it("rule 3: an oldest day equal to askedFrom does not ask for the whole range", () => {
    expect(planRatesRequest({ memory, oldestCadDay: "2026-11-01", today })).toEqual({
      from: "2026-11-24",
      to: today,
    });
  });

  it("rule 3: asks for nothing when the newest known day is today", () => {
    expect(
      planRatesRequest({
        memory: { askedFrom: "2026-11-01", rates: { "2026-11-25": 0.7 } },
        oldestCadDay: "2026-11-05",
        today,
      }),
    ).toBeNull();
  });

  it("rule 3: asks for nothing when the newest known day is after today", () => {
    expect(
      planRatesRequest({
        memory: { askedFrom: "2026-11-01", rates: { "2026-11-26": 0.7 } },
        oldestCadDay: "2026-11-05",
        today,
      }),
    ).toBeNull();
  });

  it("rule 3: takes the newest day whatever the order of the map", () => {
    expect(
      planRatesRequest({
        memory: {
          askedFrom: "2026-11-01",
          rates: { "2026-11-23": 0.7, "2026-11-02": 0.6, "2026-11-20": 0.65 },
        },
        oldestCadDay: "2026-11-05",
        today,
      }),
    ).toEqual({ from: "2026-11-24", to: today });
  });

  it("rule 3: counts the day after across a month, a year and a leap day", () => {
    const ask = (newest: string, to: string) =>
      planRatesRequest({
        memory: { askedFrom: "2020-01-01", rates: { [newest]: 0.7 } },
        oldestCadDay: "2020-01-05",
        today: to,
      });
    expect(ask("2026-11-30", "2026-12-02")).toEqual({ from: "2026-12-01", to: "2026-12-02" });
    expect(ask("2026-12-31", "2027-01-03")).toEqual({ from: "2027-01-01", to: "2027-01-03" });
    expect(ask("2028-02-28", "2028-03-01")).toEqual({ from: "2028-02-29", to: "2028-03-01" });
  });
});
