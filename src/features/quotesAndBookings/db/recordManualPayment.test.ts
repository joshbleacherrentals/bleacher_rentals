import { describe, it, expect, vi, beforeEach } from "vitest";

// The module writes through the PowerSync-backed Kysely instance. What is under
// test is what it writes — the shape RLS and the CHECK constraints will judge,
// and that the payment and its Log row travel in ONE transaction — so the batch
// executor is captured rather than run.
const { executeBatch } = vi.hoisted(() => ({ executeBatch: vi.fn() }));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecuteBatch: (statements: unknown) => executeBatch(statements),
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  // A dialect that is never connected: `.compile()` needs a query builder, not
  // a database.
  return {
    db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }),
  };
});

import { recordManualPayment } from "./recordManualPayment";

type Compiled = { sql: string; parameters: readonly unknown[] };

/** The values an INSERT would send, keyed by column. */
function valuesOf(compiled: Compiled, table: string) {
  const columns = [...compiled.sql.matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((c) => c !== table);
  return Object.fromEntries(columns.map((c, i) => [c, compiled.parameters[i]]));
}

/** The one transaction: the payment insert, then the Log row. */
function transaction() {
  expect(executeBatch).toHaveBeenCalledTimes(1);
  const statements = executeBatch.mock.calls[0][0] as Compiled[];
  expect(statements).toHaveLength(2);
  return { payment: statements[0], log: statements[1] };
}

/** The values the payment INSERT would send, keyed by column. */
function writtenRow() {
  return valuesOf(transaction().payment, "PaymentHistory");
}

/** The values the Log INSERT would send, keyed by column. */
function loggedRow() {
  return valuesOf(transaction().log, "EventChangeLog");
}

// Noon, so the day is the same on either side of a timezone — as the dialog anchors it.
const PAID_AT = new Date("2026-08-14T12:00:00").toISOString();

const base = {
  eventId: "event-1",
  installmentId: null,
  amountCents: 270000,
  currency: "USD" as const,
  method: "check" as const,
  payerName: "Riverside High",
  reference: "1041",
  notes: null,
  paidAt: PAID_AT,
  recordedByUserUuid: "user-9",
};

describe("recordManualPayment", () => {
  beforeEach(() => {
    executeBatch.mockReset();
  });

  it("writes one row into PaymentHistory", async () => {
    await recordManualPayment(base);
    expect(transaction().payment.sql).toMatch(/^insert into "PaymentHistory"/i);
  });

  it("records the payment as succeeded and manual", async () => {
    await recordManualPayment(base);
    const row = writtenRow();
    expect(row.status).toBe("succeeded");
    expect(row.entry_source).toBe("manual");
  });

  it("carries a client-generated id, so a retried upload is an upsert not a second payment", async () => {
    await recordManualPayment(base);
    const row = writtenRow();
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("never claims to be a Stripe payment", async () => {
    await recordManualPayment(base);
    const row = writtenRow();
    expect(row.stripe_checkout_session_id ?? null).toBeNull();
    expect(row.stripe_payment_intent_id ?? null).toBeNull();
  });

  it("writes the entered fields through unchanged", async () => {
    await recordManualPayment({ ...base, notes: "NSF, returned" });
    const row = writtenRow();
    expect(row).toMatchObject({
      event_uuid: "event-1",
      amount_cents: 270000,
      currency: "USD",
      payment_method_type: "check",
      payer_name: "Riverside High",
      reference: "1041",
      notes: "NSF, returned",
      paid_at: PAID_AT,
      recorded_by_user_uuid: "user-9",
    });
  });

  it("writes a negative amount unchanged — the refund path", async () => {
    await recordManualPayment({ ...base, amountCents: -270000 });
    expect(writtenRow().amount_cents).toBe(-270000);
  });

  it("sets both installment columns from one choice (§4.3)", async () => {
    await recordManualPayment({ ...base, installmentId: "inst-2" });
    const row = writtenRow();
    expect(row.installment_id).toBe("inst-2");
    expect(row.intended_installment_id).toBe("inst-2");
  });

  it("leaves both installment columns null when unapplied", async () => {
    await recordManualPayment({ ...base, installmentId: null });
    const row = writtenRow();
    expect(row.installment_id).toBeNull();
    expect(row.intended_installment_id).toBeNull();
  });

  it("refuses a zero amount before it can reach the database", async () => {
    await expect(recordManualPayment({ ...base, amountCents: 0 })).rejects.toThrow(/zero/i);
    expect(executeBatch).not.toHaveBeenCalled();
  });

  it("refuses an amount beyond the cap", async () => {
    await expect(recordManualPayment({ ...base, amountCents: 100_000_001 })).rejects.toThrow(
      /too large/i,
    );
    expect(executeBatch).not.toHaveBeenCalled();
  });

  it("refuses a row with nobody to attribute it to", async () => {
    await expect(recordManualPayment({ ...base, recordedByUserUuid: "" })).rejects.toThrow(
      /who recorded/i,
    );
    expect(executeBatch).not.toHaveBeenCalled();
  });

  it("surfaces a failed local write to the caller", async () => {
    executeBatch.mockRejectedValueOnce(new Error("disk is full"));
    await expect(recordManualPayment(base)).rejects.toThrow(/disk is full/);
  });

  // Spec event-change-log-01 §3, §5: the Log row travels with the payment.
  describe("the Log row (event-change-log-01)", () => {
    it("writes the payment and its Log row in ONE transaction of two statements", async () => {
      await recordManualPayment(base);
      const { payment, log } = transaction();
      expect(payment.sql).toMatch(/^insert into "PaymentHistory"/i);
      expect(log.sql).toMatch(/^insert into "EventChangeLog"/i);
    });

    it("files the row under payment:<the id of the payment it inserted>", async () => {
      await recordManualPayment(base);
      const paymentId = writtenRow().id;
      expect(typeof paymentId).toBe("string");
      expect(loggedRow().field_name).toBe(`payment:${paymentId}`);
    });

    it("is a payment_add row for the same event, with no previous value", async () => {
      await recordManualPayment(base);
      expect(loggedRow()).toMatchObject({
        action_type: "payment_add",
        event_uuid: "event-1",
        prev_value: null,
      });
    });

    it("names the person who recorded the payment as the author", async () => {
      await recordManualPayment({ ...base, recordedByUserUuid: "user-42" });
      expect(loggedRow().changed_by_user_uuid).toBe("user-42");
      expect(writtenRow().recorded_by_user_uuid).toBe("user-42");
    });

    it("words the payment as amount · method · paid date (R3)", async () => {
      await recordManualPayment(base);
      expect(loggedRow().next_value).toBe("$2,700.00 · Check · Aug 14, 2026");
    });

    it("uses the day the user chose, not the day it was recorded (R3)", async () => {
      await recordManualPayment({
        ...base,
        paidAt: new Date("2025-01-02T12:00:00").toISOString(),
      });
      expect(loggedRow().next_value).toBe("$2,700.00 · Check · Jan 2, 2025");
    });

    it("keeps the minus sign of a refund (R4)", async () => {
      await recordManualPayment({ ...base, amountCents: -5000 });
      expect(loggedRow().next_value).toBe("-$50.00 · Check · Aug 14, 2026");
    });

    it("words the money in the payment's own currency", async () => {
      await recordManualPayment({ ...base, amountCents: 10000, currency: "CAD" });
      expect(loggedRow().next_value).toBe("C$100.00 · Check · Aug 14, 2026");
    });

    it("words the method by its label", async () => {
      await recordManualPayment({ ...base, amountCents: 10000, method: "ach" });
      expect(loggedRow().next_value).toBe("$100.00 · ACH Payment · Aug 14, 2026");
    });

    it("never writes the notes, the reference, the payer or the installment (D3)", async () => {
      await recordManualPayment({
        ...base,
        notes: "NSF, returned",
        reference: "REF-1041",
        payerName: "Riverside High",
        installmentId: "inst-2",
      });
      const row = loggedRow();
      const text = `${row.next_value} ${row.prev_value}`;
      expect(text).not.toContain("NSF");
      expect(text).not.toContain("REF-1041");
      expect(text).not.toContain("Riverside");
      expect(text).not.toContain("inst-2");
    });

    it("writes a valid time and a uuid of its own", async () => {
      await recordManualPayment(base);
      const row = loggedRow();
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.id).not.toBe(writtenRow().id);
      expect(new Date(row.changed_at as string).toString()).not.toBe("Invalid Date");
    });

    it("writes the row nowhere when the guards refuse the payment", async () => {
      await expect(recordManualPayment({ ...base, amountCents: 0 })).rejects.toThrow();
      await expect(recordManualPayment({ ...base, amountCents: 100_000_001 })).rejects.toThrow();
      await expect(recordManualPayment({ ...base, recordedByUserUuid: "" })).rejects.toThrow();
      expect(executeBatch).not.toHaveBeenCalled();
    });
  });
});
