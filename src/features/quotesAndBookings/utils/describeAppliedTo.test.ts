import { describe, it, expect } from "vitest";
import { allocatePayments, type AllocatablePayment } from "./allocatePayments";
import { describeAppliedTo, describeOriginalTarget } from "./describeAppliedTo";

function pay(amountCents: number, over: Partial<AllocatablePayment> = {}): AllocatablePayment {
  return {
    id: "p1",
    installmentId: null,
    amountCents,
    currency: "USD",
    status: "succeeded",
    paidAt: "2026-06-01T12:00:00.000+00:00",
    createdAt: "2026-06-01T12:00:00.000+00:00",
    deletedAt: null,
    ...over,
  };
}

const schedule = [
  { id: "i1", dueDate: "2026-08-31", amountCents: 100000 },
  { id: "i2", dueDate: "2026-09-16", amountCents: 100000 },
];

function describeOne(payments: AllocatablePayment[], id = "p1") {
  const allocation = allocatePayments(schedule, payments, "USD");
  const target = payments.find((p) => p.id === id)!;
  return describeAppliedTo(target, allocation);
}

describe("describeAppliedTo", () => {
  it("names the single installment a whole payment covers, without repeating its amount", () => {
    const d = describeOne([pay(100000)]);

    expect(d).toEqual({
      kind: "applied",
      parts: [{ installmentId: "i1", dueDate: "2026-08-31", cents: 100000 }],
      unallocatedCents: 0,
      showAmounts: false,
    });
  });

  it("names every installment a split payment landed on, with each piece", () => {
    const d = describeOne([pay(150000)]);

    expect(d.kind).toBe("applied");
    if (d.kind !== "applied") return;
    expect(d.parts).toEqual([
      { installmentId: "i1", dueDate: "2026-08-31", cents: 100000 },
      { installmentId: "i2", dueDate: "2026-09-16", cents: 50000 },
    ]);
    expect(d.showAmounts).toBe(true);
  });

  it("reports money the schedule cannot absorb as leftover, and spells the amounts out", () => {
    const d = describeOne([pay(250000)]);

    expect(d.kind).toBe("applied");
    if (d.kind !== "applied") return;
    expect(d.unallocatedCents).toBe(50000);
    expect(d.showAmounts).toBe(true);
  });

  it("calls a payment nothing could be placed against unapplied", () => {
    // The refund empties the schedule, leaving the second payment nowhere to go.
    const d = describeOne([pay(200000, { id: "a" }), pay(-200000, { id: "b" })], "b");

    expect(d.kind).toBe("unapplied");
  });

  it("says why a payment was not counted at all", () => {
    expect(describeOne([pay(100000, { currency: "CAD" })])).toEqual({
      kind: "excluded",
      reason: "currency",
    });
    expect(describeOne([pay(100000, { status: "pending" })])).toEqual({
      kind: "excluded",
      reason: "status",
    });
  });

  it("says a deleted payment was deleted, ahead of its status or currency", () => {
    const deleted = "2026-06-10T09:00:00.000+00:00";
    expect(describeOne([pay(100000, { deletedAt: deleted })])).toEqual({
      kind: "excluded",
      reason: "deleted",
    });
    expect(
      describeOne([pay(100000, { deletedAt: deleted, status: "pending", currency: "CAD" })]),
    ).toEqual({ kind: "excluded", reason: "deleted" });
  });

  it("spells out the amount on a refund, so a negative piece is never read as the whole", () => {
    const d = describeOne(
      [
        pay(100000, { id: "a", installmentId: "i1" }),
        pay(-50000, { id: "b", installmentId: "i1" }),
      ],
      "b",
    );

    expect(d.kind).toBe("applied");
    if (d.kind !== "applied") return;
    expect(d.showAmounts).toBe(true);
    expect(d.parts.every((p) => p.cents < 0)).toBe(true);
  });
});

describe("describeOriginalTarget", () => {
  const allocation = allocatePayments(schedule, [], "USD");

  const target = (installmentId: string | null, intendedInstallmentId: string | null) =>
    describeOriginalTarget({ installmentId, intendedInstallmentId }, allocation);

  it("says nothing while the payment still points where it was aimed", () => {
    expect(target("i1", "i1")).toBeNull();
  });

  it("says nothing for a payment that was never aimed anywhere", () => {
    expect(target(null, null)).toBeNull();
  });

  // A schedule rebuild re-points installment_id and leaves the historical
  // target behind. That divergence is the whole reason the column exists
  // (20260902120000), so it has to be visible somewhere.
  it("names the installment the payment was originally made against", () => {
    expect(target("i2", "i1")).toEqual({ dueDate: "2026-08-31", stillOnSchedule: true });
  });

  it("reports a target the schedule no longer holds, rather than going quiet", () => {
    expect(target("i1", "deleted-installment")).toEqual({
      dueDate: null,
      stillOnSchedule: false,
    });
  });

  it("reports the original target of a payment that has since been unapplied", () => {
    expect(target(null, "i1")).toEqual({ dueDate: "2026-08-31", stillOnSchedule: true });
  });
});
