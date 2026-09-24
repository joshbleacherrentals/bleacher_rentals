import { describe, it, expect } from "vitest";
import { diffSchedule, describeBlockedRemovals } from "./scheduleDiff";
import type { PaymentInstallment } from "../types/quoteTypes";

const inst = (id: string, dueDate: string, percentageBps: number): PaymentInstallment => ({
  id,
  dueDate,
  percentageBps,
});

const existing = (id: string, dueDate: string, percentageBps: number, currency = "USD") => ({
  id,
  dueDate,
  percentageBps,
  currency,
});

const paid = (installmentId: string, amountCents: number, status = "succeeded") => ({
  installmentId,
  amountCents,
  status,
});

describe("diffSchedule", () => {
  it("inserts everything for a brand-new schedule", () => {
    const next = [inst("a", "2026-08-31", 100000)];
    expect(diffSchedule([], next, "USD")).toEqual({ toInsert: next, toUpdate: [], toDelete: [] });
  });

  it("updates a row whose date or percentage changed, without deleting it", () => {
    // The whole point: editing a date must not delete and re-insert the row,
    // which would break the payments pointing at it.
    const next = [inst("a", "2026-09-15", 120000)];
    const diff = diffSchedule([existing("a", "2026-08-31", 100000)], next, "USD");

    expect(diff.toDelete).toEqual([]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.toUpdate).toEqual(next);
  });

  it("leaves an untouched row alone entirely", () => {
    const diff = diffSchedule(
      [existing("a", "2026-08-31", 100000)],
      [inst("a", "2026-08-31", 100000)],
      "USD",
    );

    expect(diff).toEqual({ toInsert: [], toUpdate: [], toDelete: [] });
  });

  it("separates additions, edits and removals in one pass", () => {
    const diff = diffSchedule(
      [existing("a", "2026-08-31", 100000), existing("b", "2026-09-16", 100000)],
      [inst("a", "2026-08-31", 100000), inst("c", "2026-10-01", 50000)],
      "USD",
    );

    expect(diff.toInsert.map((i) => i.id)).toEqual(["c"]);
    expect(diff.toUpdate).toEqual([]);
    expect(diff.toDelete).toEqual(["b"]);
  });

  it("rewrites rows when the quote currency changes, even if nothing else did", () => {
    const next = [inst("a", "2026-08-31", 100000)];
    const diff = diffSchedule([existing("a", "2026-08-31", 100000, "USD")], next, "CAD");

    expect(diff.toUpdate).toEqual(next);
    expect(diff.toDelete).toEqual([]);
  });

  it("deletes every row when the schedule is cleared", () => {
    const diff = diffSchedule([existing("a", "2026-08-31", 100000)], [], "USD");
    expect(diff.toDelete).toEqual(["a"]);
  });
});

describe("describeBlockedRemovals", () => {
  const rows = [existing("a", "2026-08-31", 100000), existing("b", "2026-09-16", 100000)];

  it("allows removing an installment nothing was paid against", () => {
    expect(describeBlockedRemovals(["b"], rows, [paid("a", 50000)], "USD")).toBeNull();
  });

  it("refuses to remove an installment that has money against it", () => {
    const message = describeBlockedRemovals(["a"], rows, [paid("a", 100000)], "USD");

    expect(message).toContain("Aug 31, 2026");
    expect(message).toContain("$1,000.00");
    expect(message).toMatch(/cannot be removed/i);
  });

  it("sums several payments made against the same installment", () => {
    const message = describeBlockedRemovals(
      ["a"],
      rows,
      [paid("a", 40000), paid("a", 60000)],
      "USD",
    );

    expect(message).toContain("$1,000.00");
  });

  it("ignores payments that never succeeded", () => {
    expect(describeBlockedRemovals(["a"], rows, [paid("a", 100000, "failed")], "USD")).toBeNull();
  });

  it("names every blocked installment, not just the first", () => {
    const message = describeBlockedRemovals(
      ["a", "b"],
      rows,
      [paid("a", 100000), paid("b", 25000)],
      "USD",
    );

    expect(message).toContain("Aug 31, 2026");
    expect(message).toContain("Sep 16, 2026");
    expect(message).toContain("$250.00");
  });

  it("says nothing when nothing is being removed", () => {
    expect(describeBlockedRemovals([], rows, [paid("a", 100000)], "USD")).toBeNull();
  });
});
