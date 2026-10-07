import { describe, it, expect } from "vitest";
import {
  allocatePayments,
  type AllocatableInstallment,
  type AllocatablePayment,
} from "./allocatePayments";

// ── Builders ──────────────────────────────────────────────────────────
// Defaults describe the boring case (a succeeded USD payment, an untargeted
// one), so each test only spells out the part it is actually about.

let seq = 0;
const nextId = () => `p-${++seq}`;

function inst(id: string, dueDate: string, amountCents: number): AllocatableInstallment {
  return { id, dueDate, amountCents };
}

function pay(amountCents: number, over: Partial<AllocatablePayment> = {}): AllocatablePayment {
  const id = over.id ?? nextId();
  return {
    id,
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

/** Invariants that must hold for every allocation, whatever the inputs. */
function assertInvariants(result: ReturnType<typeof allocatePayments>) {
  // Conservation: no cent is invented or lost.
  expect(result.allocatedCents + result.unallocatedCents).toBe(result.totalReceivedCents);

  const summed = result.installments.reduce((s, i) => s + i.allocatedCents, 0);
  expect(summed).toBe(result.allocatedCents);

  for (const i of result.installments) {
    expect(i.allocatedCents).toBeGreaterThanOrEqual(0);
    expect(i.allocatedCents).toBeLessThanOrEqual(i.amountCents);
    // The bug this spec exists to remove: a paid_at left behind on a row that
    // is no longer paid.
    if (i.status !== "paid") expect(i.paidAt).toBeNull();
  }

  const perPayment = result.byPayment.reduce(
    (s, p) => s + p.parts.reduce((t, part) => t + part.cents, 0) + p.unallocatedCents,
    0,
  );
  expect(perPayment).toBe(result.totalReceivedCents);
}

// ── Scenarios from the spec (§7) ──────────────────────────────────────

describe("allocatePayments — spec scenarios", () => {
  it("S1: a $1 payment leaves a $2700 installment partial, not paid (Bug 1)", () => {
    const installments = [inst("i1", "2026-08-31", 270000), inst("i2", "2026-09-16", 270000)];
    const result = allocatePayments(installments, [pay(100, { installmentId: "i1" })], "USD");

    expect(result.installments[0]).toMatchObject({
      installmentId: "i1",
      allocatedCents: 100,
      status: "partial",
      paidAt: null,
    });
    expect(result.installments[1].status).toBe("unpaid");
    expect(result.totalReceivedCents).toBe(100);
    assertInvariants(result);
  });

  it("S2: a payment with no schedule is still counted (Bug 2)", () => {
    const result = allocatePayments([], [pay(200)], "USD");

    expect(result.totalReceivedCents).toBe(200);
    expect(result.unallocatedCents).toBe(200);
    expect(result.allocatedCents).toBe(0);
    expect(result.installments).toEqual([]);
    assertInvariants(result);
  });

  it("S3: an exact payment pays its installment and leaves the next alone", () => {
    const installments = [inst("i1", "2026-08-31", 270000), inst("i2", "2026-09-16", 270000)];
    const result = allocatePayments(
      installments,
      [pay(270000, { installmentId: "i1", paidAt: "2026-08-31T19:02:05.114+00:00" })],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({
      status: "paid",
      allocatedCents: 270000,
      paidAt: "2026-08-31T19:02:05.114+00:00",
    });
    expect(result.installments[1].status).toBe("unpaid");
    assertInvariants(result);
  });

  it("S4: an untargeted payment fills installments FIFO by due date", () => {
    const installments = [inst("i1", "2026-08-31", 270000), inst("i2", "2026-09-16", 270000)];
    const result = allocatePayments(installments, [pay(400000)], "USD");

    expect(result.installments[0]).toMatchObject({ status: "paid", allocatedCents: 270000 });
    expect(result.installments[1]).toMatchObject({ status: "partial", allocatedCents: 130000 });
    assertInvariants(result);
  });

  it("S6: an overpayment is counted in full and spills into unallocated", () => {
    const result = allocatePayments([inst("i1", "2026-08-31", 500000)], [pay(600000)], "USD");

    expect(result.totalReceivedCents).toBe(600000);
    expect(result.allocatedCents).toBe(500000);
    expect(result.unallocatedCents).toBe(100000);
    expect(result.installments[0].status).toBe("paid");
    assertInvariants(result);
  });

  it("S7: a payment targeting a deleted installment is re-allocated, not lost", () => {
    const result = allocatePayments(
      [inst("i-new", "2026-10-01", 100000)],
      [pay(60000, { installmentId: "i-deleted" })],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(60000);
    expect(result.installments[0]).toMatchObject({ allocatedCents: 60000, status: "partial" });
    assertInvariants(result);
  });

  it("S8: two payments summing to the nominal pay it, dated by the completing one", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [
        pay(40000, { id: "first", paidAt: "2026-08-01T10:00:00.000+00:00" }),
        pay(60000, { id: "second", paidAt: "2026-08-20T10:00:00.000+00:00" }),
      ],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({
      status: "paid",
      allocatedCents: 100000,
      paidAt: "2026-08-20T10:00:00.000+00:00",
    });
    assertInvariants(result);
  });

  it("S9: targeting wins over due-date order, the rest still goes FIFO", () => {
    const installments = [inst("i1", "2026-08-31", 100000), inst("i2", "2026-09-16", 100000)];
    const result = allocatePayments(
      installments,
      [
        pay(100000, {
          id: "targeted",
          installmentId: "i2",
          paidAt: "2026-08-01T10:00:00.000+00:00",
        }),
        pay(60000, { id: "loose", paidAt: "2026-08-02T10:00:00.000+00:00" }),
      ],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({ status: "partial", allocatedCents: 60000 });
    expect(result.installments[1]).toMatchObject({ status: "paid", allocatedCents: 100000 });
    assertInvariants(result);
  });

  it("S10: a targeted payment larger than its installment spills onto the next", () => {
    const installments = [inst("i1", "2026-08-31", 100000), inst("i2", "2026-09-16", 100000)];
    const result = allocatePayments(
      installments,
      [pay(150000, { id: "big", installmentId: "i1" })],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({ status: "paid", allocatedCents: 100000 });
    expect(result.installments[1]).toMatchObject({ status: "partial", allocatedCents: 50000 });

    // The history table needs to say where a split payment actually went.
    expect(result.byPayment).toEqual([
      {
        paymentId: "big",
        parts: [
          { installmentId: "i1", cents: 100000 },
          { installmentId: "i2", cents: 50000 },
        ],
        unallocatedCents: 0,
        excluded: null,
      },
    ]);
    assertInvariants(result);
  });

  it("S11: an installment that grows past its payment loses its paid_at", () => {
    // The row was 'paid' in the DB at $1000; the schedule was edited to $2000.
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 200000)],
      [pay(100000, { installmentId: "i1", paidAt: "2026-08-01T10:00:00.000+00:00" })],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({ status: "partial", paidAt: null });
    assertInvariants(result);
  });

  it("S12: a payment in another currency never touches the balance", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(100000, { id: "cad", currency: "CAD" })],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(0);
    expect(result.allocatedCents).toBe(0);
    expect(result.installments[0]).toMatchObject({ status: "unpaid", allocatedCents: 0 });
    expect(result.foreignCurrencyPayments).toEqual([
      { paymentId: "cad", currency: "CAD", amountCents: 100000 },
    ]);
    expect(result.byPayment[0]).toMatchObject({ paymentId: "cad", excluded: "currency" });
    assertInvariants(result);
  });
});

// ── Ordering, formats, purity ─────────────────────────────────────────

describe("allocatePayments — determinism", () => {
  const installments = [
    inst("i2", "2026-09-16", 100000),
    inst("i1", "2026-08-31", 100000),
    inst("i3", "2026-10-01", 100000),
  ];
  const payments = [
    pay(50000, { id: "c", paidAt: "2026-08-03T10:00:00.000+00:00" }),
    pay(120000, { id: "a", paidAt: "2026-08-01T10:00:00.000+00:00" }),
    pay(30000, { id: "b", paidAt: "2026-08-02T10:00:00.000+00:00" }),
  ];

  it("orders installments by due date regardless of input order", () => {
    const result = allocatePayments(installments, payments, "USD");
    expect(result.installments.map((i) => i.installmentId)).toEqual(["i1", "i2", "i3"]);
  });

  it("produces identical output for shuffled inputs", () => {
    const a = allocatePayments(installments, payments, "USD");
    const b = allocatePayments([...installments].reverse(), [...payments].reverse(), "USD");
    expect(b).toEqual(a);
  });

  it("compares PowerSync and PostgREST timestamp formats correctly", () => {
    // Same instants, written the two ways they actually reach us. If these were
    // compared as strings the order would flip.
    const postgrest = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [
        pay(60000, { id: "early", paidAt: "2026-08-01T10:00:00.000+00:00" }),
        pay(40000, { id: "late", paidAt: "2026-08-20T10:00:00.000+00:00" }),
      ],
      "USD",
    );
    const powersync = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [
        pay(60000, { id: "early", paidAt: "2026-08-01 10:00:00.000+00" }),
        pay(40000, { id: "late", paidAt: "2026-08-20 10:00:00.000+00" }),
      ],
      "USD",
    );

    expect(powersync.installments[0].allocatedCents).toBe(postgrest.installments[0].allocatedCents);
    expect(powersync.byPayment.map((p) => p.paymentId)).toEqual(["early", "late"]);
  });

  it("falls back to created_at, then id, and sorts unparseable timestamps last", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [
        pay(50000, { id: "broken", paidAt: "not-a-date", createdAt: "also-not-a-date" }),
        pay(50000, { id: "dated", paidAt: null, createdAt: "2026-08-01T10:00:00.000+00:00" }),
      ],
      "USD",
    );

    expect(result.byPayment.map((p) => p.paymentId)).toEqual(["dated", "broken"]);
    assertInvariants(result);
  });

  it("does not mutate its inputs", () => {
    const i = [inst("i2", "2026-09-16", 100000), inst("i1", "2026-08-31", 100000)];
    const p = [
      pay(50000, { id: "z", paidAt: "2026-08-05T10:00:00.000+00:00" }),
      pay(50000, { id: "y", paidAt: "2026-08-01T10:00:00.000+00:00" }),
    ];
    const iCopy = structuredClone(i);
    const pCopy = structuredClone(p);

    allocatePayments(i, p, "USD");

    expect(i).toEqual(iCopy);
    expect(p).toEqual(pCopy);
  });
});

// ── Degenerate and hostile inputs ─────────────────────────────────────

describe("allocatePayments — edge cases", () => {
  it("handles no installments and no payments", () => {
    const result = allocatePayments([], [], "USD");
    expect(result).toMatchObject({
      installments: [],
      byPayment: [],
      totalReceivedCents: 0,
      allocatedCents: 0,
      unallocatedCents: 0,
      foreignCurrencyPayments: [],
    });
  });

  it("ignores pending and failed payments", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [
        pay(50000, { id: "ok" }),
        pay(90000, { id: "pending", status: "pending" }),
        pay(90000, { id: "failed", status: "failed" }),
      ],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(50000);
    expect(result.byPayment.find((p) => p.paymentId === "pending")?.excluded).toBe("status");
    expect(result.byPayment.find((p) => p.paymentId === "failed")?.excluded).toBe("status");
    assertInvariants(result);
  });

  it("does not loop or divide on a zero-amount installment", () => {
    const result = allocatePayments(
      [inst("i0", "2026-08-31", 0), inst("i1", "2026-09-16", 100000)],
      [pay(100000)],
      "USD",
    );

    // A $0 installment is trivially covered; nothing paid it, so it carries no
    // timestamp. The money goes to the real installment.
    expect(result.installments[0]).toMatchObject({ allocatedCents: 0, paidAt: null });
    expect(result.installments[1]).toMatchObject({ status: "paid", allocatedCents: 100000 });
    assertInvariants(result);
  });

  it("treats an empty-string installmentId as untargeted", () => {
    // create-checkout sends installmentId: "" when there is no schedule.
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(50000, { installmentId: "" })],
      "USD",
    );

    expect(result.installments[0].allocatedCents).toBe(50000);
    assertInvariants(result);
  });

  it("compares currency case- and whitespace-insensitively", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(50000, { currency: "usd " })],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(50000);
    assertInvariants(result);
  });

  it("counts a zero-amount payment without affecting anything", () => {
    const result = allocatePayments([inst("i1", "2026-08-31", 100000)], [pay(0)], "USD");
    expect(result.totalReceivedCents).toBe(0);
    expect(result.installments[0].status).toBe("unpaid");
    assertInvariants(result);
  });
});

// ── Negative amounts (docs/specs/manual-payment-entry.md §3.3, §3.4, T2) ──
//
// A refund, a bounced check and a corrected typo are all one thing: a payment
// with a negative amount. The allocator used to clamp those to zero, which
// made them invisible in every total on the page.

describe("allocatePayments — negative amounts", () => {
  it("S3: a refund targeted at an installment reopens it", () => {
    const installments = [inst("i1", "2026-08-31", 270000), inst("i2", "2026-09-16", 270000)];
    const result = allocatePayments(
      installments,
      [
        pay(270000, { id: "a", installmentId: "i1", paidAt: "2026-06-01T12:00:00.000+00:00" }),
        pay(-270000, { id: "b", installmentId: "i1", paidAt: "2026-06-05T12:00:00.000+00:00" }),
      ],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({
      installmentId: "i1",
      allocatedCents: 0,
      status: "unpaid",
      paidAt: null,
    });
    expect(result.totalReceivedCents).toBe(0);
    assertInvariants(result);
  });

  it("S3: the refund's breakdown names the installment it reopened, signed (§3.4)", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 270000)],
      [
        pay(270000, { id: "a", installmentId: "i1", paidAt: "2026-06-01T12:00:00.000+00:00" }),
        pay(-270000, { id: "b", installmentId: "i1", paidAt: "2026-06-05T12:00:00.000+00:00" }),
      ],
      "USD",
    );

    const refund = result.byPayment.find((p) => p.paymentId === "b")!;
    expect(refund.parts).toEqual([{ installmentId: "i1", cents: -270000 }]);
    expect(refund.unallocatedCents).toBe(0);
    expect(refund.excluded).toBeNull();
  });

  it("S4: a typo corrected by an offsetting row leaves only the intended money", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 270000)],
      [
        pay(150000, { id: "typo", paidAt: "2026-06-01T12:00:00.000+00:00" }),
        pay(-150000, { id: "reversal", paidAt: "2026-06-02T12:00:00.000+00:00" }),
        pay(15000, { id: "correct", paidAt: "2026-06-03T12:00:00.000+00:00" }),
      ],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(15000);
    expect(result.installments[0]).toMatchObject({ allocatedCents: 15000, status: "partial" });
    assertInvariants(result);
  });

  it("S5: an untargeted refund un-fills in reverse — the newest obligation reopens first", () => {
    const installments = [inst("i1", "2026-08-31", 270000), inst("i2", "2026-09-16", 270000)];
    const result = allocatePayments(
      installments,
      [
        pay(540000, { id: "a", paidAt: "2026-06-01T12:00:00.000+00:00" }),
        pay(-100000, { id: "b", paidAt: "2026-06-05T12:00:00.000+00:00" }),
      ],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({ allocatedCents: 270000, status: "paid" });
    expect(result.installments[1]).toMatchObject({ allocatedCents: 170000, status: "partial" });
    expect(result.totalReceivedCents).toBe(440000);
    assertInvariants(result);
  });

  it("un-fills strictly by due date descending, not by insertion order", () => {
    const installments = [
      inst("late", "2026-12-01", 100000),
      inst("early", "2026-01-01", 100000),
      inst("middle", "2026-06-01", 100000),
    ];
    const result = allocatePayments(
      installments,
      [pay(300000, { id: "a" }), pay(-150000, { id: "b" })],
      "USD",
    );

    const byId = new Map(result.installments.map((i) => [i.installmentId, i.allocatedCents]));
    expect(byId.get("early")).toBe(100000);
    expect(byId.get("middle")).toBe(50000);
    expect(byId.get("late")).toBe(0);
    assertInvariants(result);
  });

  it("E2: a refund on an empty installment spills into the pool, never going negative", () => {
    const installments = [inst("i1", "2026-08-31", 100000), inst("i2", "2026-09-16", 100000)];
    const result = allocatePayments(
      installments,
      [
        pay(200000, { id: "a", installmentId: "i2" }),
        pay(-50000, { id: "b", installmentId: "i1" }),
      ],
      "USD",
    );

    for (const i of result.installments) {
      expect(i.allocatedCents).toBeGreaterThanOrEqual(0);
    }
    expect(result.totalReceivedCents).toBe(150000);
    assertInvariants(result);
  });

  it("E1: a refund larger than everything received goes negative, and is not clamped", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(50000, { id: "a" }), pay(-120000, { id: "b" })],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(-70000);
    expect(result.unallocatedCents).toBe(-70000);
    expect(result.allocatedCents).toBe(0);
    expect(result.installments[0]).toMatchObject({ allocatedCents: 0, status: "unpaid" });
    assertInvariants(result);
  });

  it("reports a negative total with no schedule at all", () => {
    const result = allocatePayments([], [pay(-25000, { id: "b" })], "USD");
    expect(result.totalReceivedCents).toBe(-25000);
    expect(result.unallocatedCents).toBe(-25000);
    assertInvariants(result);
  });

  it("clears paidAt on an installment a refund reopened (§3.3 step 9)", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [
        pay(100000, { id: "a", installmentId: "i1" }),
        pay(-1, { id: "b", installmentId: "i1", paidAt: "2026-07-01T12:00:00.000+00:00" }),
      ],
      "USD",
    );

    expect(result.installments[0].status).toBe("partial");
    expect(result.installments[0].paidAt).toBeNull();
  });

  it("E11: a negative payment in another currency is excluded and un-fills nothing", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(100000, { id: "a" }), pay(-100000, { id: "b", currency: "CAD" })],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({ allocatedCents: 100000, status: "paid" });
    expect(result.totalReceivedCents).toBe(100000);
    expect(result.byPayment.find((p) => p.paymentId === "b")!.excluded).toBe("currency");
    expect(result.foreignCurrencyPayments).toEqual([
      { paymentId: "b", currency: "CAD", amountCents: -100000 },
    ]);
    assertInvariants(result);
  });

  it("ignores a negative payment that never succeeded", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(100000, { id: "a" }), pay(-100000, { id: "b", status: "failed" })],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(100000);
    expect(result.byPayment.find((p) => p.paymentId === "b")!.excluded).toBe("status");
  });

  it("is order-independent with mixed signs", () => {
    const installments = [inst("i1", "2026-08-31", 270000), inst("i2", "2026-09-16", 270000)];
    const payments = [
      pay(270000, { id: "a", installmentId: "i1", paidAt: "2026-06-01T12:00:00.000+00:00" }),
      pay(-100000, { id: "b", paidAt: "2026-06-02T12:00:00.000+00:00" }),
      pay(200000, { id: "c", paidAt: "2026-06-03T12:00:00.000+00:00" }),
      pay(-50000, { id: "d", installmentId: "i1", paidAt: "2026-06-04T12:00:00.000+00:00" }),
    ];

    const forwards = allocatePayments(installments, payments, "USD");
    const backwards = allocatePayments(installments, [...payments].reverse(), "USD");

    expect(backwards.installments).toEqual(forwards.installments);
    expect(backwards.totalReceivedCents).toBe(forwards.totalReceivedCents);
    expect(backwards.unallocatedCents).toBe(forwards.unallocatedCents);
    assertInvariants(forwards);
  });

  it("does not mutate the caller's arrays when signs are mixed", () => {
    const installments = [inst("i2", "2026-09-16", 270000), inst("i1", "2026-08-31", 270000)];
    const payments = [pay(300000, { id: "a" }), pay(-100000, { id: "b" })];
    const installmentsCopy = structuredClone(installments);
    const paymentsCopy = structuredClone(payments);

    allocatePayments(installments, payments, "USD");

    expect(installments).toEqual(installmentsCopy);
    expect(payments).toEqual(paymentsCopy);
  });

  it("every payment's breakdown still accounts for its whole amount", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000), inst("i2", "2026-09-16", 100000)],
      [
        pay(250000, { id: "a" }),
        pay(-30000, { id: "b" }),
        pay(-90000, { id: "c", installmentId: "i1" }),
      ],
      "USD",
    );

    for (const detail of result.byPayment) {
      const source = [250000, -30000, -90000][["a", "b", "c"].indexOf(detail.paymentId)];
      const summed = detail.parts.reduce((s, p) => s + p.cents, 0) + detail.unallocatedCents;
      expect(summed).toBe(source);
    }
    assertInvariants(result);
  });
});

// ── Soft-deleted payments (docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md) ──
//
// A deleted payment is still returned, so a screen that chooses to show it can say what became of
// it — but it is never counted, never placed, and never reopens anything.

const DELETED_AT = "2026-06-10T09:00:00.000+00:00";

describe("allocatePayments — deleted payments", () => {
  it("excludes a deleted payment as 'deleted' and still returns it", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(40000, { id: "gone", installmentId: "i1", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.byPayment).toEqual([
      { paymentId: "gone", parts: [], unallocatedCents: 0, excluded: "deleted" },
    ]);
    assertInvariants(result);
  });

  it("does not count it in totalReceivedCents", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(60000, { id: "kept" }), pay(40000, { id: "gone", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.totalReceivedCents).toBe(60000);
    assertInvariants(result);
  });

  it("does not fill an installment it targeted", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(100000, { id: "gone", installmentId: "i1", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({
      status: "unpaid",
      allocatedCents: 0,
      paidAt: null,
    });
    expect(result.allocatedCents).toBe(0);
    assertInvariants(result);
  });

  it("does not fill an installment through the FIFO pool either", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000), inst("i2", "2026-09-16", 100000)],
      [pay(150000, { id: "gone", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.installments.map((i) => i.status)).toEqual(["unpaid", "unpaid"]);
    expect(result.unallocatedCents).toBe(0);
    assertInvariants(result);
  });

  it("does not spill into unallocated when it is larger than the whole schedule", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(900000, { id: "gone", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.unallocatedCents).toBe(0);
    expect(result.totalReceivedCents).toBe(0);
    assertInvariants(result);
  });

  it("a deleted refund (negative) does not reopen an installment", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 270000)],
      [
        pay(270000, { id: "paid", installmentId: "i1" }),
        pay(-270000, {
          id: "refund",
          installmentId: "i1",
          paidAt: "2026-06-05T12:00:00.000+00:00",
          deletedAt: DELETED_AT,
        }),
      ],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({ status: "paid", allocatedCents: 270000 });
    expect(result.totalReceivedCents).toBe(270000);
    expect(result.byPayment.find((p) => p.paymentId === "refund")?.excluded).toBe("deleted");
    assertInvariants(result);
  });

  it("a deleted untargeted refund does not un-fill the newest obligation", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000), inst("i2", "2026-09-16", 100000)],
      [pay(200000, { id: "paid" }), pay(-100000, { id: "refund", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.installments.map((i) => i.status)).toEqual(["paid", "paid"]);
    expect(result.totalReceivedCents).toBe(200000);
    assertInvariants(result);
  });

  it("'deleted' wins over a status that would exclude it", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(100000, { id: "gone", status: "pending", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.byPayment[0].excluded).toBe("deleted");
  });

  it("'deleted' wins over another currency, and is not reported as foreign", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(100000, { id: "gone", currency: "CAD", deletedAt: DELETED_AT })],
      "USD",
    );

    expect(result.byPayment[0].excluded).toBe("deleted");
    expect(result.foreignCurrencyPayments).toEqual([]);
  });

  it("leaves every other figure as it was without the deleted row", () => {
    const installments = [inst("i1", "2026-08-31", 100000), inst("i2", "2026-09-16", 100000)];
    const live = [
      pay(130000, { id: "a" }),
      pay(-20000, { id: "b", paidAt: "2026-06-02T12:00:00.000+00:00" }),
    ];
    const deleted = pay(70000, { id: "gone", installmentId: "i2", deletedAt: DELETED_AT });

    const without = allocatePayments(installments, live, "USD");
    const withDeleted = allocatePayments(installments, [...live, deleted], "USD");

    expect(withDeleted.installments).toEqual(without.installments);
    expect(withDeleted.totalReceivedCents).toBe(without.totalReceivedCents);
    expect(withDeleted.allocatedCents).toBe(without.allocatedCents);
    expect(withDeleted.unallocatedCents).toBe(without.unallocatedCents);
    expect(withDeleted.foreignCurrencyPayments).toEqual(without.foreignCurrencyPayments);
    expect(withDeleted.byPayment.filter((p) => p.paymentId !== "gone")).toEqual(without.byPayment);
  });

  it("counts a payment whose deletedAt is null exactly as before", () => {
    const result = allocatePayments(
      [inst("i1", "2026-08-31", 100000)],
      [pay(100000, { id: "kept", installmentId: "i1", deletedAt: null })],
      "USD",
    );

    expect(result.installments[0]).toMatchObject({ status: "paid" });
    expect(result.byPayment[0].excluded).toBeNull();
  });

  it("does not mutate its inputs when a payment is deleted", () => {
    const installments = [inst("i1", "2026-08-31", 100000)];
    const payments = [pay(50000, { id: "a" }), pay(50000, { id: "gone", deletedAt: DELETED_AT })];
    const before = JSON.stringify({ installments, payments });

    allocatePayments(installments, payments, "USD");

    expect(JSON.stringify({ installments, payments })).toBe(before);
  });
});
