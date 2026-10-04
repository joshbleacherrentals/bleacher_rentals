import { describe, it, expect } from "vitest";
import { allocatePayments, type AllocatablePayment } from "./allocatePayments";
import { computeAmountDue } from "./computeAmountDue";

const TODAY = "2026-09-01";

function payment(amountCents: number, over: Partial<AllocatablePayment> = {}): AllocatablePayment {
  return {
    id: `p-${amountCents}`,
    installmentId: null,
    amountCents,
    currency: "USD",
    status: "succeeded",
    paidAt: "2026-08-01T10:00:00.000+00:00",
    createdAt: "2026-08-01T10:00:00.000+00:00",
    deletedAt: null,
    ...over,
  };
}

/** The figures the public Pay tab puts in front of a paying client. */
function due(
  installments: { id: string; dueDate: string; amountCents: number }[],
  payments: AllocatablePayment[],
  totalCents: number,
) {
  return computeAmountDue({
    allocation: allocatePayments(installments, payments, "USD"),
    totalCents,
    today: TODAY,
  });
}

describe("computeAmountDue", () => {
  it("asks for the whole total when nothing is scheduled or paid", () => {
    expect(due([], [], 500000)).toMatchObject({
      paidCents: 0,
      remainingCents: 500000,
      defaultPayCents: 500000,
    });
  });

  it("subtracts an unscheduled payment from what is still owed", () => {
    expect(due([], [payment(200)], 500000)).toMatchObject({
      paidCents: 200,
      remainingCents: 499800,
      defaultPayCents: 499800,
    });
  });

  it("asks only for installments that are already due", () => {
    const result = due(
      [
        { id: "i1", dueDate: "2026-08-31", amountCents: 100000 },
        { id: "i2", dueDate: "2026-10-01", amountCents: 100000 },
      ],
      [],
      200000,
    );

    expect(result.overdueOwedCents).toBe(100000);
    expect(result.defaultPayCents).toBe(100000);
  });

  it("does not subtract a targeted payment twice", () => {
    // The old bug: the paid installment dropped out of the overdue sum AND the
    // payment was subtracted again, so the client was asked for too little.
    const result = due(
      [
        { id: "i1", dueDate: "2026-08-01", amountCents: 100000 },
        { id: "i2", dueDate: "2026-08-15", amountCents: 100000 },
      ],
      [payment(100000, { installmentId: "i1" })],
      200000,
    );

    expect(result.paidCents).toBe(100000);
    // i1 is covered; i2 is due and untouched — exactly one installment owed.
    expect(result.overdueOwedCents).toBe(100000);
    expect(result.defaultPayCents).toBe(100000);
  });

  it("asks for the uncovered part of a partially paid installment", () => {
    const result = due(
      [{ id: "i1", dueDate: "2026-08-01", amountCents: 270000 }],
      [payment(100, { installmentId: "i1" })],
      270000,
    );

    expect(result.overdueOwedCents).toBe(269900);
    expect(result.defaultPayCents).toBe(269900);
  });

  it("never asks for more than the remaining balance", () => {
    const result = due(
      [
        { id: "i1", dueDate: "2026-08-01", amountCents: 100000 },
        { id: "i2", dueDate: "2026-08-02", amountCents: 100000 },
      ],
      [payment(150000)],
      150000, // the contract total is lower than the schedule
    );

    expect(result.remainingCents).toBe(0);
    expect(result.defaultPayCents).toBe(0);
  });

  it("asks for nothing once everything is covered", () => {
    const result = due(
      [{ id: "i1", dueDate: "2026-08-01", amountCents: 100000 }],
      [payment(100000, { installmentId: "i1" })],
      100000,
    );

    expect(result).toMatchObject({ remainingCents: 0, overdueOwedCents: 0, defaultPayCents: 0 });
  });

  it("clamps an overpayment to zero rather than going negative", () => {
    const result = due([], [payment(600000)], 500000);

    expect(result.remainingCents).toBe(0);
    expect(result.defaultPayCents).toBe(0);
  });

  it("ignores a payment in another currency", () => {
    const result = due([], [payment(100000, { currency: "CAD" })], 500000);

    expect(result.paidCents).toBe(0);
    expect(result.remainingCents).toBe(500000);
  });
});
