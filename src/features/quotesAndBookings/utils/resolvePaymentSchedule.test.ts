import { describe, expect, it } from "vitest";
import {
  resolvePaymentSchedule,
  convertLegacySchedule,
  markFirstInstallmentOnSigning,
  validatePaymentSchedule,
} from "./resolvePaymentSchedule";
const row = (id: string, percentageBps: number, dueOnSigning = false) => ({
  id,
  dueDate: "2026-10-01",
  percentageBps,
  dueOnSigning,
});
const first = (id: string, percentageBps: number, dueDate = "") => ({
  id,
  dueDate,
  percentageBps,
  dueOnSigning: true,
});
describe("percentage schedules", () => {
  it("follows price changes without changing shares", () => {
    const schedule = [row("a", 5000), row("b", 5000)];
    expect(resolvePaymentSchedule(schedule, 100000).map((i) => i.amountCents)).toEqual([
      50000, 50000,
    ]);
    expect(resolvePaymentSchedule(schedule, 200000).map((i) => i.amountCents)).toEqual([
      100000, 100000,
    ]);
    expect(schedule[0].percentageBps).toBe(5000);
  });
  it("allocates odd cents deterministically regardless of query order", () => {
    const schedule = [row("b", 3333), row("a", 3333), row("c", 3334)];
    const result = resolvePaymentSchedule(schedule, 101);
    expect(result.map((i) => i.amountCents)).toEqual([33, 34, 34]);
    expect(resolvePaymentSchedule([...schedule].reverse(), 101).reverse()).toEqual(result);
    expect(resolvePaymentSchedule(schedule, 0).every((i) => i.amountCents === 0)).toBe(true);
  });
  it("does not normalize invalid schedules, including at zero total", () => {
    expect(
      resolvePaymentSchedule([row("a", 2500), row("b", 2500)], 200000).map((i) => i.amountCents),
    ).toEqual([50000, 50000]);
    expect(validatePaymentSchedule([first("a", 9000)])).toContain("100%");
    expect(validatePaymentSchedule([first("a", 11000)])).toBeTruthy();
    expect(validatePaymentSchedule([first("a", NaN)])).toBeTruthy();
    expect(validatePaymentSchedule([first("a", 10000, "2026-02-30")])).toBeTruthy();
    expect(validatePaymentSchedule([first("a", 3333), row("b", 3333), row("c", 3334)])).toBeNull();
    expect(() => resolvePaymentSchedule([row("a", 10000)], -1)).toThrow();
  });
  it("refuses an empty schedule: a quote cannot be saved without one", () => {
    expect(validatePaymentSchedule([])).toBe("Add a payment schedule before saving.");
    expect(validatePaymentSchedule([first("a", 10000)])).toBeNull();
  });
  describe("the first installment is due on signing", () => {
    const FIRST_ERROR = "The first installment is always due on signing.";
    it("accepts a marked first row with no date, or with the day the database wrote", () => {
      expect(validatePaymentSchedule([first("a", 5000), row("b", 5000)])).toBeNull();
      expect(validatePaymentSchedule([first("a", 5000, "2026-11-26"), row("b", 5000)])).toBeNull();
    });
    it("refuses a first row that is not marked", () => {
      expect(validatePaymentSchedule([row("a", 5000), row("b", 5000)])).toBe(FIRST_ERROR);
      expect(validatePaymentSchedule([row("a", 10000)])).toBe(FIRST_ERROR);
    });
    it("refuses a marked row that is not the first, and a second marked row", () => {
      expect(validatePaymentSchedule([row("a", 5000), first("b", 5000)])).toBe(FIRST_ERROR);
      expect(validatePaymentSchedule([first("a", 5000), first("b", 5000)])).toBe(FIRST_ERROR);
    });
    it("refuses an invalid date on the marked row and a missing date on any other row", () => {
      expect(validatePaymentSchedule([first("a", 5000, "2026-02-30"), row("b", 5000)])).toBe(
        "All installments need a valid due date.",
      );
      expect(validatePaymentSchedule([first("a", 5000), { ...row("b", 5000), dueDate: "" }])).toBe(
        "All installments need a valid due date.",
      );
    });
    it("checks the percentages before the mark", () => {
      expect(validatePaymentSchedule([row("a", 9000)])).toContain("100%");
    });
  });
  describe("markFirstInstallmentOnSigning", () => {
    it("marks only the first row and clears its date, leaving ids, shares and other dates", () => {
      const rows = [row("a", 6000), row("b", 4000)];
      expect(markFirstInstallmentOnSigning(rows)).toEqual([
        { id: "a", dueDate: "", percentageBps: 6000, dueOnSigning: true },
        { id: "b", dueDate: "2026-10-01", percentageBps: 4000, dueOnSigning: false },
      ]);
    });
    it("moves a wrongly placed mark to the first row and returns an empty schedule as it is", () => {
      expect(
        markFirstInstallmentOnSigning([row("a", 5000), first("b", 5000, "2026-11-01")]).map(
          (i) => i.dueOnSigning,
        ),
      ).toEqual([true, false]);
      expect(markFirstInstallmentOnSigning([])).toEqual([]);
    });
  });
  it("converts balanced legacy amounts with exact percentage rounding", () => {
    const legacy = [1, 1, 1].map((amountCents, i) => ({
      id: String(i),
      dueDate: "2026-10-01",
      amountCents,
    }));
    expect(convertLegacySchedule(legacy, 3).map((i) => i.percentageBps)).toEqual([
      3334, 3333, 3333,
    ]);
    expect(convertLegacySchedule(legacy, 6).map((i) => i.percentageBps)).toEqual([
      1667, 1667, 1667,
    ]);
    expect(
      convertLegacySchedule(
        legacy.map((i) => ({ ...i, amountCents: 0 })),
        0,
      ).map((i) => i.percentageBps),
    ).toEqual([3333, 3333, 3334]);
    expect(() => convertLegacySchedule(legacy, 0)).toThrow();
    expect(() => convertLegacySchedule([{ ...legacy[0], amountCents: -1 }], 3)).toThrow();
  });
});
