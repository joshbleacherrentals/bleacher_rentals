import { describe, it, expect } from "vitest";
import {
  changedDraftFields,
  draftFromPayment,
  evaluateRecordPaymentForm,
  emptyDraft,
  type RecordPaymentDraft,
} from "./recordPaymentForm";

const TODAY = "2026-08-14";

const draft = (over: Partial<RecordPaymentDraft> = {}): RecordPaymentDraft => ({
  ...emptyDraft({ payerName: "Riverside High", today: TODAY }),
  ...over,
});

const evaluate = (over: Partial<RecordPaymentDraft> = {}) =>
  evaluateRecordPaymentForm(draft(over), TODAY, { currencyResolved: true });

describe("evaluateRecordPaymentForm", () => {
  it("starts unsubmittable, and does not scold anyone for not having typed yet", () => {
    const state = evaluate();
    expect(state.canSubmit).toBe(false);
    expect(state.amountError).toBeNull();
  });

  it("defaults to unapplied — money is not attached to an installment by accident", () => {
    expect(draft().installmentId).toBeNull();
  });

  it("defaults the date to today", () => {
    expect(draft().paidAtDate).toBe(TODAY);
  });

  describe("S6: zero", () => {
    it("is rejected inline", () => {
      expect(evaluate({ amountRaw: "0" }).amountError).toMatch(/cannot be zero/i);
    });

    it("blocks submission", () => {
      expect(evaluate({ amountRaw: "0.00" }).canSubmit).toBe(false);
    });
  });

  describe("S7: a negative amount", () => {
    const negative = evaluate({ amountRaw: "-50" });

    it("is accepted", () => {
      expect(negative.amountCents).toBe(-5000);
      expect(negative.amountError).toBeNull();
      expect(negative.canSubmit).toBe(true);
    });

    it("is flagged as money going out", () => {
      expect(negative.isNegative).toBe(true);
    });

    it("changes the submit label", () => {
      expect(negative.submitLabel).toBe("Record Refund / Adjustment");
    });

    it("reads as a plain payment when positive", () => {
      expect(evaluate({ amountRaw: "50" }).submitLabel).toBe("Record Payment");
      expect(evaluate({ amountRaw: "50" }).isNegative).toBe(false);
    });

    it("accepts accounting's parentheses too", () => {
      const parens = evaluate({ amountRaw: "($12.00)" });
      expect(parens.amountCents).toBe(-1200);
      expect(parens.isNegative).toBe(true);
    });
  });

  describe("the typo guard", () => {
    it("rejects an amount beyond the cap", () => {
      expect(evaluate({ amountRaw: "9999999" }).amountError).toMatch(/1,000,000/);
    });

    it("explains gibberish rather than going quiet", () => {
      expect(evaluate({ amountRaw: "abc" }).amountError).toMatch(/amount/i);
    });
  });

  describe("E4: the date", () => {
    it("refuses tomorrow — a payment received tomorrow is not received", () => {
      const state = evaluate({ amountRaw: "50", paidAtDate: "2026-08-15" });
      expect(state.dateError).toMatch(/future/i);
      expect(state.canSubmit).toBe(false);
    });

    it("allows today", () => {
      expect(evaluate({ amountRaw: "50", paidAtDate: TODAY }).dateError).toBeNull();
    });

    it("allows the past", () => {
      expect(evaluate({ amountRaw: "50", paidAtDate: "2025-01-01" }).dateError).toBeNull();
    });

    it("requires a date at all", () => {
      expect(evaluate({ amountRaw: "50", paidAtDate: "" }).canSubmit).toBe(false);
    });
  });

  describe("payer", () => {
    it("is required", () => {
      const state = evaluate({ amountRaw: "50", payerName: "   " });
      expect(state.payerError).toMatch(/who/i);
      expect(state.canSubmit).toBe(false);
    });

    it("is prefilled from the quote's contact", () => {
      expect(draft().payerName).toBe("Riverside High");
    });
  });

  describe("the Reference label follows the payment type", () => {
    it.each([
      ["check", "Check #"],
      ["ach", "ACH trace"],
      ["manual_credit_card", "Auth code"],
    ] as const)("%s → %s", (method, label) => {
      expect(evaluate({ method }).referenceLabel).toBe(label);
    });
  });

  describe("E6: a submission already in flight", () => {
    it("cannot be sent twice", () => {
      const state = evaluateRecordPaymentForm(draft({ amountRaw: "50" }), TODAY, {
        currencyResolved: true,
        isSubmitting: true,
      });
      expect(state.canSubmit).toBe(false);
    });
  });

  it("is pure — evaluating twice changes nothing", () => {
    const d = draft({ amountRaw: "-1,234.56" });
    const opts = { currencyResolved: true };
    expect(evaluateRecordPaymentForm(d, TODAY, opts)).toEqual(
      evaluateRecordPaymentForm(d, TODAY, opts),
    );
  });

  // E5 / §3.5: the event's currency is not a preference, it is a correctness
  // rule. A row written in the wrong one is excluded from every total and
  // raises a banner blaming the person who entered it — and the ledger is
  // append-only, so there is no taking it back. Until the office currency has
  // actually resolved, this form does not know what it would be writing.
  describe("E5: a currency that has not resolved yet", () => {
    const unresolved = (over: Partial<RecordPaymentDraft> = {}) =>
      evaluateRecordPaymentForm(draft(over), TODAY, { currencyResolved: false });

    it("blocks submission of an otherwise complete form", () => {
      expect(evaluate({ amountRaw: "50" }).canSubmit).toBe(true);
      expect(unresolved({ amountRaw: "50" }).canSubmit).toBe(false);
    });

    it("says why, rather than leaving a dead button", () => {
      expect(unresolved({ amountRaw: "50" }).currencyError).toMatch(/currency/i);
    });

    it("blocks a refund just the same — a negative row in the wrong currency is worse", () => {
      expect(unresolved({ amountRaw: "-50" }).canSubmit).toBe(false);
    });

    it("says nothing once the currency is known", () => {
      expect(evaluate({ amountRaw: "50" }).currencyError).toBeNull();
    });
  });
});

// ── Edit mode (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3, §6.1) ──
//
// The same fields and rules as recording a payment. What differs: Save is disabled while nothing
// has changed, and the currency never changes, so it never has to be waited for.

/** A manual payment as the Billing tab holds it — paid on 14 Aug, noon local, against installment i1. */
const PAYMENT = {
  amountCents: 270000,
  paidAt: new Date("2026-08-14T12:00:00").toISOString(),
  createdAt: new Date("2026-08-14T15:30:00").toISOString(),
  paymentMethodType: "ach",
  installmentId: "i1",
  payerName: "Riverside High",
  reference: "TRACE-77",
  notes: "second half",
};

describe("draftFromPayment", () => {
  it("fills every field the form collects from the payment", () => {
    expect(draftFromPayment(PAYMENT)).toEqual({
      method: "ach",
      amountRaw: "2700.00",
      paidAtDate: "2026-08-14",
      installmentId: "i1",
      payerName: "Riverside High",
      reference: "TRACE-77",
      notes: "second half",
    });
  });

  it("writes a refund with its minus sign, which the amount parser reads back", () => {
    const refund = draftFromPayment({ ...PAYMENT, amountCents: -123456 });
    expect(refund.amountRaw).toBe("-1234.56");
    expect(
      evaluateRecordPaymentForm(refund, TODAY, { mode: "edit", original: refund }).amountCents,
    ).toBe(-123456);
  });

  it("turns missing optional text into empty strings, which is what the inputs hold", () => {
    const bare = draftFromPayment({
      ...PAYMENT,
      reference: null,
      notes: null,
      installmentId: null,
    });
    expect(bare.reference).toBe("");
    expect(bare.notes).toBe("");
    expect(bare.installmentId).toBeNull();
  });

  it("takes the date the payment was dated, falling back to when it was recorded", () => {
    expect(draftFromPayment({ ...PAYMENT, paidAt: null }).paidAtDate).toBe("2026-08-14");
  });

  it("reads PowerSync's timestamp shape as well as PostgREST's", () => {
    // The local database returns `2026-08-13 19:00:40.247+00`; that is an instant, not a local date.
    const instant = "2026-08-13 19:00:40.247+00";
    const local = new Date(Date.parse("2026-08-13T19:00:40.247Z"));
    const expected = new Date(local.getTime() - local.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 10);
    expect(draftFromPayment({ ...PAYMENT, paidAt: instant }).paidAtDate).toBe(expected);
  });

  it("falls back to check when a manual payment carries a method this form does not know", () => {
    expect(draftFromPayment({ ...PAYMENT, paymentMethodType: "card" }).method).toBe("check");
  });
});

describe("changedDraftFields", () => {
  const original = draftFromPayment(PAYMENT);
  const changed = (over: Partial<RecordPaymentDraft>) =>
    changedDraftFields(original, { ...original, ...over });

  it("is empty when nothing was touched", () => {
    expect(changedDraftFields(original, { ...original })).toEqual([]);
  });

  it.each([
    ["amount", { amountRaw: "2800.00" }],
    ["paidAt", { paidAtDate: "2026-08-13" }],
    ["method", { method: "check" as const }],
    ["payer", { payerName: "Riverside High School" }],
    ["reference", { reference: "TRACE-78" }],
    ["notes", { notes: "third half" }],
    ["installment", { installmentId: null }],
  ] as const)("names %s when it is the only thing changed", (field, over) => {
    expect(changed(over)).toEqual([field]);
  });

  it("names several at once, in the order the form lists them", () => {
    expect(changed({ notes: "x", amountRaw: "1", method: "check", installmentId: "i2" })).toEqual([
      "amount",
      "method",
      "notes",
      "installment",
    ]);
  });

  it("does not count a different way of typing the same amount", () => {
    expect(changed({ amountRaw: "$2,700" })).toEqual([]);
    expect(changed({ amountRaw: " 2700.0 " })).toEqual([]);
  });

  it("does not count whitespace around the text fields", () => {
    expect(
      changed({ payerName: "  Riverside High ", reference: " TRACE-77 ", notes: " second half " }),
    ).toEqual([]);
  });

  it("counts clearing an optional field, and does not count filling it with nothing", () => {
    expect(changed({ reference: "" })).toEqual(["reference"]);
    const bare = draftFromPayment({ ...PAYMENT, reference: null });
    expect(changedDraftFields(bare, { ...bare, reference: "   " })).toEqual([]);
  });

  it("counts an amount that does not parse as changed: it is not the amount that was there", () => {
    expect(changed({ amountRaw: "abc" })).toEqual(["amount"]);
  });
});

describe("evaluateRecordPaymentForm — edit mode", () => {
  const original = draftFromPayment(PAYMENT);
  const edit = (over: Partial<RecordPaymentDraft> = {}, isSubmitting = false) =>
    evaluateRecordPaymentForm({ ...original, ...over }, TODAY, {
      mode: "edit",
      original,
      isSubmitting,
    });

  it("disables Save while nothing has changed, and says so", () => {
    const state = edit();
    expect(state.nothingChanged).toBe(true);
    expect(state.canSubmit).toBe(false);
  });

  it("enables Save as soon as something changes", () => {
    const state = edit({ notes: "a new note" });
    expect(state.nothingChanged).toBe(false);
    expect(state.canSubmit).toBe(true);
  });

  it("disables Save again when the change is put back", () => {
    expect(edit({ amountRaw: "100" }).canSubmit).toBe(true);
    expect(edit({ amountRaw: "2700.00" }).canSubmit).toBe(false);
  });

  it("blocks a zero amount", () => {
    const state = edit({ amountRaw: "0" });
    expect(state.canSubmit).toBe(false);
    expect(state.amountError).toMatch(/cannot be zero/i);
  });

  it("blocks a date in the future", () => {
    const state = edit({ paidAtDate: "2026-08-15" });
    expect(state.canSubmit).toBe(false);
    expect(state.dateError).toMatch(/future/i);
  });

  it("blocks a payer cleared to nothing", () => {
    expect(edit({ payerName: "   " }).canSubmit).toBe(false);
    expect(edit({ payerName: "   " }).payerError).toBe("Who paid?");
  });

  it("does not wait for the currency: a payment's own currency never changes", () => {
    const state = edit({ notes: "a new note" });
    expect(state.currencyError).toBeNull();
    expect(state.canSubmit).toBe(true);
  });

  it("says Save changes, not Record Payment — a refund edited is still not a new payment", () => {
    expect(edit({ notes: "x" }).submitLabel).toBe("Save changes");
    expect(edit({ amountRaw: "-50" }).submitLabel).toBe("Save changes");
    expect(edit({ amountRaw: "-50" }).isNegative).toBe(true);
  });

  it("disables Save while a write is in flight", () => {
    expect(edit({ notes: "x" }, true).canSubmit).toBe(false);
  });

  it("leaves recording a payment exactly as it was", () => {
    const state = evaluateRecordPaymentForm(draft({ amountRaw: "50" }), TODAY, {
      currencyResolved: true,
    });
    expect(state.nothingChanged).toBe(false);
    expect(state.canSubmit).toBe(true);
    expect(state.submitLabel).toBe("Record Payment");
  });
});
