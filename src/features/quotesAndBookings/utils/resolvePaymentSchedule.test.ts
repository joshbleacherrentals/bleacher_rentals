import { describe, expect, it } from "vitest";
import {
  resolvePaymentSchedule,
  convertLegacySchedule,
  validatePaymentSchedule,
} from "./resolvePaymentSchedule";
const row = (id: string, percentageBps: number) => ({ id, dueDate: "2026-10-01", percentageBps });
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
    expect(validatePaymentSchedule([row("a", 9000)])).toContain("100%");
    expect(validatePaymentSchedule([row("a", 11000)])).toBeTruthy();
    expect(validatePaymentSchedule([row("a", NaN)])).toBeTruthy();
    expect(validatePaymentSchedule([{ ...row("a", 10000), dueDate: "2026-02-30" }])).toBeTruthy();
    expect(validatePaymentSchedule([row("a", 3333), row("b", 3333), row("c", 3334)])).toBeNull();
    expect(validatePaymentSchedule([])).toBeNull();
    expect(() => resolvePaymentSchedule([row("a", 10000)], -1)).toThrow();
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
