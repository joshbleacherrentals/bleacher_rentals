import { describe, it, expect, vi, beforeEach } from "vitest";

const { executeBatch } = vi.hoisted(() => ({ executeBatch: vi.fn() }));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecuteBatch: (statements: unknown) => executeBatch(statements),
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { Kysely, SqliteDialect } = await import("kysely");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: {} as any }) }) };
});

import { deleteManualPayment } from "./deleteManualPayment";

type Compiled = { sql: string; parameters: readonly unknown[] };

function transaction() {
  expect(executeBatch).toHaveBeenCalledTimes(1);
  const statements = executeBatch.mock.calls[0][0] as Compiled[];
  expect(statements).toHaveLength(2);
  return { update: statements[0], log: statements[1] };
}

function updated(compiled: Compiled) {
  const setClause = /set (.*) where/i.exec(compiled.sql)![1];
  // A column set to NULL is written into the SQL, not passed as a parameter.
  const parts = setClause.split(",").map((p) => p.trim());
  let param = 0;
  const columns: Record<string, unknown> = {};
  for (const part of parts) {
    const [, name, rhs] = /^"([a-z_]+)" = (.*)$/.exec(part)!;
    columns[name] = rhs === "?" ? compiled.parameters[param++] : rhs === "null" ? null : rhs;
  }
  return { columns, id: compiled.parameters[param] };
}

function logged(compiled: Compiled) {
  const columns = [...compiled.sql.matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((c) => c !== "EventChangeLog");
  return Object.fromEntries(columns.map((c, i) => [c, compiled.parameters[i]]));
}

const PAYMENT: Parameters<typeof deleteManualPayment>[0]["payment"] = {
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

const del = (reason: string, payment = PAYMENT, userId: string | null = "user-9") =>
  deleteManualPayment({
    eventId: "event-1",
    payment,
    reason,
    deletedByUserUuid: userId,
  });

describe("deleteManualPayment", () => {
  beforeEach(() => {
    executeBatch.mockReset();
  });

  it("writes the soft delete and its log row in ONE transaction", async () => {
    await del("entered twice");
    const { update, log } = transaction();
    expect(update.sql).toMatch(/^update "PaymentHistory"/i);
    expect(log.sql).toMatch(/^insert into "EventChangeLog"/i);
  });

  it("writes exactly the four columns a deletion owns, aimed at that payment", async () => {
    await del("entered twice");
    const { columns, id } = updated(transaction().update);
    expect(Object.keys(columns).sort()).toEqual([
      "delete_reason",
      "deleted_at",
      "deleted_by_user_uuid",
      "installment_id",
    ]);
    expect(id).toBe("pay-1");
  });

  it("sets the author to the caller, the time to now, and the reason trimmed", async () => {
    const before = Date.now();
    await del("  entered twice ");
    const { columns } = updated(transaction().update);
    expect(columns.deleted_by_user_uuid).toBe("user-9");
    expect(columns.delete_reason).toBe("entered twice");
    const at = Date.parse(columns.deleted_at as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("detaches the payment from its installment, and leaves intended_installment_id alone", async () => {
    await del("entered twice");
    const { update } = transaction();
    expect(updated(update).columns.installment_id).toBeNull();
    expect(update.sql).not.toContain('"intended_installment_id"');
  });

  it("changes nothing else about the payment", async () => {
    await del("entered twice");
    const { update } = transaction();
    for (const column of [
      "amount_cents",
      "paid_at",
      "payment_method_type",
      "payer_name",
      "reference",
      "notes",
      "event_uuid",
      "currency",
      "status",
      "entry_source",
      "recorded_by_user_uuid",
    ]) {
      expect(update.sql).not.toContain(`"${column}"`);
    }
  });

  it("logs a payment_delete row that describes the payment and carries NO reason", async () => {
    await del("entered twice on the wrong quote");
    const { update, log } = transaction();
    const row = logged(log);
    expect(row.action_type).toBe("payment_delete");
    expect(row.field_name).toBe("payment:pay-1");
    expect(row.event_uuid).toBe("event-1");
    expect(row.changed_by_user_uuid).toBe("user-9");
    expect(row.prev_value).toBe("$100.00 · Check · Aug 14, 2026");
    expect(row.next_value).toBeNull();
    // The reason goes to the payment's own row and nowhere else (spec 09, D7).
    expect(log.parameters.join(" ")).not.toContain("wrong quote");
    expect(log.sql).not.toContain("reason");
    expect(update.parameters).toContain("entered twice on the wrong quote");
  });

  it("describes the payment in its own currency", async () => {
    await del("x", { ...PAYMENT, currency: "CAD" });
    expect(logged(transaction().log).prev_value).toBe("C$100.00 · Check · Aug 14, 2026");
  });

  describe("refuses locally, and writes nothing", () => {
    it.each(["", "   ", "\t"])("an empty reason (%j)", async (reason) => {
      await expect(del(reason)).rejects.toThrow(/reason/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("a Stripe payment", async () => {
      const stripe = { ...PAYMENT, entrySource: "stripe" as const, paymentMethodType: "card" };
      await expect(del("x", stripe)).rejects.toThrow(/manual/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("a payment that is already deleted", async () => {
      const gone = { ...PAYMENT, deletedAt: "2026-08-20T09:00:00.000Z" };
      await expect(del("x", gone)).rejects.toThrow(/already deleted/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });

    it("a deletion by nobody in particular", async () => {
      await expect(del("x", PAYMENT, null)).rejects.toThrow(/who/i);
      expect(executeBatch).not.toHaveBeenCalled();
    });
  });
});
