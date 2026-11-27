import { describe, expect, it } from "vitest";
import type { CollectedPayment, KpiRole } from "./collectionDays";
import { kpiForRange } from "./kpiAverages";

// docs/specs/accountant-kpi.md §1 (C8-C11, D2, D3, D11) and the examples E7 and E8.

function row(
  days: number,
  collectedDay = "2026-11-15",
  role: KpiRole = "final",
  id = `${role}-${days}-${collectedDay}`,
): CollectedPayment {
  return { eventId: "E", paymentId: id, role, dueDate: "2026-11-01", collectedDay, days };
}

const ALL = { from: null, to: null };
const NOVEMBER = { from: "2026-11-01", to: "2026-11-30" };

describe("D11: whole days, rounded up", () => {
  it("E7: 8, 9 and 11 days give 28 / 3 = 9.33, shown as 10, from 3 payments", () => {
    const rows = [
      row(8, "2026-11-10", "final", "a"),
      row(9, "2026-11-11", "final", "b"),
      row(11, "2026-11-12", "final", "c"),
    ];
    expect(kpiForRange(rows, "final", ALL)).toEqual({ days: 10, count: 3 });
  });

  it("an exact average stays as it is: 9, 9 and 9 give 9", () => {
    const rows = [9, 9, 9].map((d, i) => row(d, "2026-11-10", "final", `p${i}`));
    expect(kpiForRange(rows, "final", ALL)).toEqual({ days: 9, count: 3 });
  });

  it("an exact division by more than one payment: 27 days over 3 payments is 9, not 10", () => {
    const rows = [10, 8, 9].map((d, i) => row(d, "2026-11-10", "final", `p${i}`));
    expect(kpiForRange(rows, "final", ALL)).toEqual({ days: 9, count: 3 });
  });

  it("1, 0, 0, 0, 0 give 0.2, shown as 1", () => {
    const rows = [1, 0, 0, 0, 0].map((d, i) => row(d, "2026-11-10", "final", `p${i}`));
    expect(kpiForRange(rows, "final", ALL)).toEqual({ days: 1, count: 5 });
  });

  it("payments all collected on their due day give 0 days, which is a number, not nothing", () => {
    expect(kpiForRange([row(0)], "final", ALL)).toEqual({ days: 0, count: 1 });
  });

  it("one payment is its own days", () => {
    expect(kpiForRange([row(5)], "final", ALL)).toEqual({ days: 5, count: 1 });
  });
});

describe("C11: nothing to average", () => {
  it("no rows gives null days and a count of 0", () => {
    expect(kpiForRange([], "deposit", ALL)).toEqual({ days: null, count: 0 });
  });

  it("rows of the other role give nothing", () => {
    expect(kpiForRange([row(3, "2026-11-10", "deposit")], "final", ALL)).toEqual({
      days: null,
      count: 0,
    });
  });
});

describe("D3, C8: early payments are not counted", () => {
  it("0, 4 and -2 give an average of 2, from 2 payments", () => {
    const rows = [0, 4, -2].map((d, i) => row(d, "2026-11-10", "final", `p${i}`));
    expect(kpiForRange(rows, "final", ALL)).toEqual({ days: 2, count: 2 });
  });

  it("only early payments: nothing to show", () => {
    expect(kpiForRange([row(-1), row(-5, "2026-11-16", "final", "x")], "final", ALL)).toEqual({
      days: null,
      count: 0,
    });
  });
});

describe("D2, C9: the range is on the collected day, both ends included", () => {
  it("E8: collected Nov 3 (6 days) is in November and not in October", () => {
    const rows = [row(6, "2026-11-03")];
    expect(kpiForRange(rows, "final", NOVEMBER)).toEqual({ days: 6, count: 1 });
    expect(kpiForRange(rows, "final", { from: "2026-10-01", to: "2026-10-31" })).toEqual({
      days: null,
      count: 0,
    });
  });

  it("the first and the last day of the range are in", () => {
    const rows = [row(1, "2026-11-01", "final", "a"), row(3, "2026-11-30", "final", "b")];
    expect(kpiForRange(rows, "final", NOVEMBER)).toEqual({ days: 2, count: 2 });
  });

  it("the day before and the day after are out", () => {
    const rows = [row(1, "2026-10-31", "final", "a"), row(3, "2026-12-01", "final", "b")];
    expect(kpiForRange(rows, "final", NOVEMBER)).toEqual({ days: null, count: 0 });
  });

  it("a null end is no limit at that end", () => {
    const rows = [row(2, "2020-01-01", "final", "a"), row(4, "2030-01-01", "final", "b")];
    expect(kpiForRange(rows, "final", { from: "2026-01-01", to: null })).toEqual({
      days: 4,
      count: 1,
    });
    expect(kpiForRange(rows, "final", { from: null, to: "2026-01-01" })).toEqual({
      days: 2,
      count: 1,
    });
    expect(kpiForRange(rows, "final", ALL)).toEqual({ days: 3, count: 2 });
  });
});

describe("the two roles are separate", () => {
  it("Deposit and Final Payment average their own rows", () => {
    const rows = [
      row(2, "2026-11-10", "deposit", "d1"),
      row(4, "2026-11-10", "deposit", "d2"),
      row(10, "2026-11-10", "final", "f1"),
    ];
    expect(kpiForRange(rows, "deposit", ALL)).toEqual({ days: 3, count: 2 });
    expect(kpiForRange(rows, "final", ALL)).toEqual({ days: 10, count: 1 });
  });

  it("does not change the rows it is given", () => {
    const rows = [row(2), row(4, "2026-11-16", "final", "x")];
    const before = JSON.stringify(rows);
    kpiForRange(rows, "final", NOVEMBER);
    expect(JSON.stringify(rows)).toBe(before);
  });
});
