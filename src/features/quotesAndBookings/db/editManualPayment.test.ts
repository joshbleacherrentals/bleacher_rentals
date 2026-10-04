import { describe, it, expect, vi, beforeEach } from "vitest";

// What is under test is what gets written: which columns, and that the log row travels in the
// same transaction. So the batch executor is captured, and the Kysely instance is never connected
// — `.compile()` needs a query builder, not a database.
const { executeBatch } = vi.hoisted(() => ({ executeBatch: vi.fn() }));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecuteBatch: (statements: unknown) => executeBatch(statements),
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { editManualPayment } from "./editManualPayment";
import { draftFromPayment, type RecordPaymentDraft } from "../utils/recordPaymentForm";

type Compiled = { sql: string; parameters: readonly unknown[] };

/** The two statements of the one transaction: the payment update, then the log row. */
function transaction() {
  expect(executeBatch).toHaveBeenCalledTimes(1);
  const statements = executeBatch.mock.calls[0][0] as Compiled[];
  expect(statements).toHaveLength(2);
  return { update: statements[0], log: statements[1] };
}

/** The columns the UPDATE sets, keyed by column, and the id it is aimed at. */
function updated(compiled: Compiled) {
  const setClause = /set (.*) where/i.exec(compiled.sql)![1];
  const columns = [...setClause.matchAll(/"([a-z_]+)" = \?/g)].map((m) => m[1]);
  return {
    columns: Object.fromEntries(columns.map((c, i) => [c, compiled.parameters[i]])),
    id: compiled.parameters[columns.length],
  };
}

/** The values of the INSERT into EventChangeLog, keyed by column. */
function logged(compiled: Compiled) {
  const columns = [...compiled.sql.matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((c) => c !== "EventChangeLog");
  return Object.fromEntries(columns.map((c, i) => [c, compiled.parameters[i]]));
}

const PAYMENT: Parameters<typeof editManualPayment>[0]["payment"] = {
  id: "pay-1",
  amountCents: 10000,
  currency: "USD",
  paidAt: new Date("2026-08-14T12:00:00").toISOString(),
  createdAt: new Date("2026-08-14T15:30:00").toISOString(),
  paymentMethodType: "check",
  entrySource: "manual",
  installmentId: "i1",
  payerName: "Riverside High",
  reference: "1041",
  notes: "first half",
  deletedAt: null,
};

const label = (id: string | null) => (id ? `Due ${id}` : "Not applied");
const original = draftFromPayment(PAYMENT);

const edit = (
  over: Partial<RecordPaymentDraft>,
  payment = PAYMENT,
  userId: string | null = "user-9",
) =>
  editManualPayment({
    eventId: "event-1",
    payment,
    draft: { ...original, ...over },
    changedByUserUuid: userId,
    installmentLabel: label,
  });

describe("editManualPayment", () => {
  beforeEach(() => {
    executeBatch.mockReset();
  });

  it("writes the payment update and its log row in ONE transaction", async () => {
    await edit({ amountRaw: "120.00" });
    const { update, log } = transaction();
    expect(update.sql).toMatch(/^update "PaymentHistory"/i);
    expect(log.sql).toMatch(/^insert into "EventChangeLog"/i);
  });

  it("updates only the columns that changed, aimed at that payment", async () => {
    await edit({ amountRaw: "120.00", notes: "second half" });
    const { update } = transaction();
    const { columns, id } = updated(update);
    expect(columns).toEqual({ amount_cents: 12000, notes: "second half" });
    expect(id).toBe("pay-1");
  });

  it("writes both installment columns together, with the one choice", async () => {
    await edit({ installmentId: "i2" });
    const { columns } = updated(transaction().update);
    expect(columns).toEqual({ installment_id: "i2", intended_installment_id: "i2" });
  });

  it("writes both installment columns as null when the payment is applied to nothing", async () => {
    await edit({ installmentId: null });
    const { columns } = updated(transaction().update);
    expect(columns).toEqual({ installment_id: null, intended_installment_id: null });
  });

  it("never writes an installment column when the installment was left alone", async () => {
    await edit({ notes: "x" });
    const { columns } = updated(transaction().update);
    expect(Object.keys(columns)).toEqual(["notes"]);
  });

  it("never writes a column the database will not let anyone change", async () => {
    await edit({
      amountRaw: "1",
      paidAtDate: "2026-08-01",
      method: "ach",
      payerName: "x",
      reference: "x",
      notes: "x",
      installmentId: "i2",
    });
    const { update } = transaction();
    for (const immutable of [
      "event_uuid",
      "currency",
      "status",
      "entry_source",
      "recorded_by_user_uuid",
      "created_at",
      "payer_email",
      "stripe_receipt_url",
      "deleted_at",
      "deleted_by_user_uuid",
      "delete_reason",
    ]) {
      expect(update.sql).not.toContain(`"${immutable}"`);
    }
  });

  it("logs a payment_edit row naming the payment, the event, the author and the changed fields", async () => {
    await edit({ amountRaw: "120.00", method: "ach" });
    const row = logged(transaction().log);
    expect(row.action_type).toBe("payment_edit");
    expect(row.field_name).toBe("payment:pay-1");
    expect(row.event_uuid).toBe("event-1");
    expect(row.changed_by_user_uuid).toBe("user-9");
    expect(row.prev_value).toBe("Amount $100.00 · Method Check");
    expect(row.next_value).toBe("Amount $120.00 · Method ACH Payment");
    expect(typeof row.id).toBe("string");
    expect(new Date(row.changed_at as string).toString()).not.toBe("Invalid Date");
  });

  it("describes the installment by the label it was given", async () => {
    await edit({ installmentId: "i2" });
    const row = logged(transaction().log);
    expect(row.prev_value).toBe("Applied to Due i1");
    expect(row.next_value).toBe("Applied to Due i2");
  });

  it("keeps the payment's own currency in the log text", async () => {
    const cad = { ...PAYMENT, currency: "CAD" };
    await edit({ amountRaw: "120.00" }, cad);
    const row = logged(transaction().log);
    expect(row.prev_value).toBe("Amount C$100.00");
    expect(row.next_value).toBe("Amount C$120.00");
  });

  // A refused upload is discarded silently, so what the database would refuse is refused here,
  // before anything is written — as recordManualPayment does.
  describe("refuses locally, and writes nothing", () => {
    it("a zero amount", async () => {
      await expect(edit({ amountRaw: "0" })).rejects.toThrow(/zero/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("an amount that does not parse", async () => {
      await expect(edit({ amountRaw: "abc" })).rejects.toThrow();
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("an amount that is too large", async () => {
      await expect(edit({ amountRaw: "999999999" })).rejects.toThrow(/too large/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("a Stripe payment", async () => {
      const stripe = { ...PAYMENT, entrySource: "stripe" as const, paymentMethodType: "card" };
      await expect(edit({ notes: "x" }, stripe)).rejects.toThrow(/manual/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("a payment that is already deleted", async () => {
      const gone = { ...PAYMENT, deletedAt: "2026-08-20T09:00:00.000Z" };
      await expect(edit({ notes: "x" }, gone)).rejects.toThrow(/deleted/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("an edit that changes nothing", async () => {
      await expect(edit({})).rejects.toThrow(/nothing/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("an edit by nobody in particular", async () => {
      await expect(edit({ notes: "x" }, PAYMENT, null)).rejects.toThrow(/who/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });
  });
});
