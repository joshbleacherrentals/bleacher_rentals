import { describe, it, expect } from "vitest";
import { scheduleBalance, installmentPercent } from "./scheduleBalance";

describe("scheduleBalance", () => {
  it("is empty when no installments are set", () => {
    expect(scheduleBalance([], 10_000)).toEqual({ status: "empty" });
  });

  it("is balanced when the installments add up to the total", () => {
    expect(scheduleBalance([{ amountCents: 5_000 }, { amountCents: 5_000 }], 10_000)).toEqual({
      status: "balanced",
    });
  });

  it("reports how much is still unscheduled", () => {
    expect(scheduleBalance([{ amountCents: 4_000 }], 10_000)).toEqual({
      status: "short",
      diffCents: 6_000,
    });
  });

  it("reports how much is scheduled past the total", () => {
    expect(scheduleBalance([{ amountCents: 12_500 }], 10_000)).toEqual({
      status: "over",
      diffCents: 2_500,
    });
  });
});

describe("installmentPercent", () => {
  it("rounds to a whole percent", () => {
    expect(installmentPercent(3_333, 10_000)).toBe(33);
  });

  it("is 0 when the quote has no total yet", () => {
    expect(installmentPercent(5_000, 0)).toBe(0);
  });
});
