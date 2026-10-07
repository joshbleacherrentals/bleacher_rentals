import { describe, it, expect } from "vitest";
import {
  buildPaymentPatch,
  describePaymentChanges,
  describePaymentForLog,
  isAcceptableDeleteReason,
  normalizeDeleteReason,
  parsePaymentLogFieldName,
  paymentLogFieldName,
  paymentLogLabel,
} from "./paymentEdit";
import { draftFromPayment, type RecordPaymentDraft } from "./recordPaymentForm";

// docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3, §6.1: the pure part of editing and
// deleting a payment — what changed, how the log words it, how the log names the payment, and
// whether a reason is acceptable.

const PAID_AT = new Date("2026-08-14T12:00:00").toISOString();

const PAYMENT = {
  id: "11111111-2222-3333-4444-555555555555",
  amountCents: 10000,
  currency: "USD",
  paidAt: PAID_AT,
  createdAt: new Date("2026-08-14T15:30:00").toISOString(),
  paymentMethodType: "check",
  entrySource: "manual" as const,
  installmentId: "i1",
  payerName: "Riverside High",
  reference: "1041",
  notes: "first half",
};

const label = (id: string | null) =>
  id === "i1" ? "Due Aug 31, 2026" : id ? "Due Sep 16, 2026" : "Not applied";

const original = draftFromPayment(PAYMENT);
const draftOf = (over: Partial<RecordPaymentDraft>): RecordPaymentDraft => ({
  ...original,
  ...over,
});

describe("buildPaymentPatch", () => {
  it("is empty when nothing changed", () => {
    expect(buildPaymentPatch(PAYMENT, original)).toEqual({ changed: [], columns: {} });
  });

  it("carries only the column that changed — the amount", () => {
    expect(buildPaymentPatch(PAYMENT, draftOf({ amountRaw: "120.00" }))).toEqual({
      changed: ["amount"],
      columns: { amount_cents: 12000 },
    });
  });

  it("carries a negative amount as it was typed", () => {
    expect(buildPaymentPatch(PAYMENT, draftOf({ amountRaw: "(50.00)" })).columns).toEqual({
      amount_cents: -5000,
    });
  });

  it("anchors a changed paid date at noon, so a timezone does not move the day", () => {
    const { columns } = buildPaymentPatch(PAYMENT, draftOf({ paidAtDate: "2026-08-10" }));
    expect(columns).toEqual({ paid_at: new Date("2026-08-10T12:00:00").toISOString() });
  });

  it("leaves paid_at alone when only the time of day differs from noon but the date is the same", () => {
    const evening = { ...PAYMENT, paidAt: new Date("2026-08-14T19:45:00").toISOString() };
    expect(buildPaymentPatch(evening, draftFromPayment(evening)).columns).toEqual({});
  });

  it("carries the method", () => {
    expect(buildPaymentPatch(PAYMENT, draftOf({ method: "ach" })).columns).toEqual({
      payment_method_type: "ach",
    });
  });

  it("carries the payer, trimmed", () => {
    expect(buildPaymentPatch(PAYMENT, draftOf({ payerName: "  Riverside HS " })).columns).toEqual({
      payer_name: "Riverside HS",
    });
  });

  it("carries a cleared reference and cleared notes as null, never as an empty string", () => {
    expect(buildPaymentPatch(PAYMENT, draftOf({ reference: "  " })).columns).toEqual({
      reference: null,
    });
    expect(buildPaymentPatch(PAYMENT, draftOf({ notes: "" })).columns).toEqual({ notes: null });
  });

  it("writes BOTH installment columns together, with the one choice", () => {
    expect(buildPaymentPatch(PAYMENT, draftOf({ installmentId: "i2" })).columns).toEqual({
      installment_id: "i2",
      intended_installment_id: "i2",
    });
  });

  it("writes both installment columns as null when the payment is applied to nothing", () => {
    expect(buildPaymentPatch(PAYMENT, draftOf({ installmentId: null })).columns).toEqual({
      installment_id: null,
      intended_installment_id: null,
    });
  });

  it("never touches an installment column when the installment was left alone", () => {
    const { columns } = buildPaymentPatch(PAYMENT, draftOf({ notes: "x", amountRaw: "1" }));
    expect(columns).not.toHaveProperty("installment_id");
    expect(columns).not.toHaveProperty("intended_installment_id");
  });

  it("carries several changes at once, and only those", () => {
    const patch = buildPaymentPatch(
      PAYMENT,
      draftOf({ amountRaw: "120", method: "ach", notes: "second half" }),
    );
    expect(patch.changed).toEqual(["amount", "method", "notes"]);
    expect(Object.keys(patch.columns).sort()).toEqual([
      "amount_cents",
      "notes",
      "payment_method_type",
    ]);
  });

  it("never carries a column the database will not let anyone change", () => {
    const all = buildPaymentPatch(
      PAYMENT,
      draftOf({
        amountRaw: "1",
        paidAtDate: "2026-08-01",
        method: "ach",
        payerName: "x",
        reference: "x",
        notes: "x",
        installmentId: "i2",
      }),
    );
    for (const immutable of [
      "id",
      "event_uuid",
      "currency",
      "status",
      "entry_source",
      "recorded_by_user_uuid",
      "created_at",
      "payer_email",
      "stripe_payment_intent_id",
      "stripe_checkout_session_id",
      "stripe_connection_uuid",
      "stripe_receipt_url",
    ]) {
      expect(all.columns).not.toHaveProperty(immutable);
    }
  });

  it("refuses an amount that is zero, or does not parse: that is the form's job, not a patch's", () => {
    expect(() => buildPaymentPatch(PAYMENT, draftOf({ amountRaw: "0" }))).toThrow(/amount/i);
    expect(() => buildPaymentPatch(PAYMENT, draftOf({ amountRaw: "abc" }))).toThrow(/amount/i);
  });
});

describe("describePaymentChanges — the text the log shows", () => {
  const describe_ = (over: Partial<RecordPaymentDraft>, payment = PAYMENT) => {
    const draft = { ...draftFromPayment(payment), ...over };
    const { changed } = buildPaymentPatch(payment, draft);
    return describePaymentChanges(payment, draft, changed, label);
  };

  it("names the changed fields only, before and after", () => {
    expect(describe_({ amountRaw: "120.00", method: "ach" })).toEqual({
      prev: "Amount $100.00 · Method Check",
      next: "Amount $120.00 · Method ACH Payment",
    });
  });

  it("words each field", () => {
    expect(describe_({ paidAtDate: "2026-08-10" })).toEqual({
      prev: "Paid date Aug 14, 2026",
      next: "Paid date Aug 10, 2026",
    });
    expect(describe_({ payerName: "Riverside HS" })).toEqual({
      prev: "Payer Riverside High",
      next: "Payer Riverside HS",
    });
    expect(describe_({ reference: "1042" })).toEqual({
      prev: "Reference 1041",
      next: "Reference 1042",
    });
    expect(describe_({ notes: "second half" })).toEqual({
      prev: "Notes first half",
      next: "Notes second half",
    });
    expect(describe_({ installmentId: "i2" })).toEqual({
      prev: "Applied to Due Aug 31, 2026",
      next: "Applied to Due Sep 16, 2026",
    });
  });

  it("shows a cleared field as a dash, and an unapplied payment by name", () => {
    expect(describe_({ reference: "" }).next).toBe("Reference —");
    expect(describe_({ installmentId: null }).next).toBe("Applied to Not applied");
  });

  it("formats money in the payment's own currency, not the quote's", () => {
    const cad = { ...PAYMENT, currency: "CAD" };
    expect(describe_({ amountRaw: "120.00" }, cad)).toEqual({
      prev: "Amount C$100.00",
      next: "Amount C$120.00",
    });
  });

  it("shows a refund with its minus sign", () => {
    const refund = { ...PAYMENT, amountCents: -5000 };
    expect(describe_({ amountRaw: "-60" }, refund)).toEqual({
      prev: "Amount -$50.00",
      next: "Amount -$60.00",
    });
  });
});

describe("describePaymentForLog", () => {
  it("says amount, method and date", () => {
    expect(describePaymentForLog(PAYMENT)).toBe("$100.00 · Check · Aug 14, 2026");
  });

  it("uses the payment's own currency and the Stripe label for a Stripe payment", () => {
    expect(
      describePaymentForLog({
        ...PAYMENT,
        currency: "CAD",
        entrySource: "stripe",
        paymentMethodType: "card",
      }),
    ).toBe("C$100.00 · Stripe · Aug 14, 2026");
  });

  it("falls back to the date the payment was recorded when it carries no paid date", () => {
    expect(describePaymentForLog({ ...PAYMENT, paidAt: null })).toBe(
      "$100.00 · Check · Aug 14, 2026",
    );
  });
});

describe("the payment:<id> field name", () => {
  it("round-trips through the parser", () => {
    const name = paymentLogFieldName(PAYMENT.id);
    expect(name).toBe(`payment:${PAYMENT.id}`);
    expect(parsePaymentLogFieldName(name)).toBe(PAYMENT.id);
  });

  it("rejects a plain `payment`, an empty id and anything that is not a payment's name", () => {
    expect(parsePaymentLogFieldName("payment")).toBeNull();
    expect(parsePaymentLogFieldName("payment:")).toBeNull();
    expect(parsePaymentLogFieldName("is_qbo")).toBeNull();
    expect(parsePaymentLogFieldName("line_item")).toBeNull();
    expect(parsePaymentLogFieldName(null)).toBeNull();
  });

  it("keeps an id that itself contains a colon whole", () => {
    expect(parsePaymentLogFieldName("payment:a:b")).toBe("a:b");
  });
});

describe("paymentLogLabel", () => {
  it("names the payment from the event's payments", () => {
    expect(paymentLogLabel(paymentLogFieldName(PAYMENT.id), [PAYMENT])).toBe(
      "$100.00 · Check · Aug 14, 2026",
    );
  });

  it("falls back to a short id when the payment is not among them", () => {
    expect(paymentLogLabel(paymentLogFieldName(PAYMENT.id), [])).toBe("Payment 11111111");
  });

  it("falls back to plain Payment when the field name carries no id", () => {
    expect(paymentLogLabel("payment", [PAYMENT])).toBe("Payment");
    expect(paymentLogLabel(null, [PAYMENT])).toBe("Payment");
  });
});

describe("a delete reason", () => {
  it.each(["", "   ", "\t", " \n \t "])("%j is refused", (reason) => {
    expect(isAcceptableDeleteReason(reason)).toBe(false);
    expect(normalizeDeleteReason(reason)).toBeNull();
  });

  it("is accepted, trimmed", () => {
    expect(isAcceptableDeleteReason(" x ")).toBe(true);
    expect(normalizeDeleteReason(" x ")).toBe("x");
  });

  it("keeps what is inside the text as it was", () => {
    expect(normalizeDeleteReason("  entered  twice\nby mistake ")).toBe(
      "entered  twice\nby mistake",
    );
  });
});
