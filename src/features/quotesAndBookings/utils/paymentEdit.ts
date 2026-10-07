import { formatMoney } from "./formatMoney";
import { formatDate } from "./formatDate";
import { Currency } from "../types/quoteTypes";
import {
  PAYMENT_METHOD_LABELS,
  paymentMethodLabel,
  type EntrySource,
  type ManualPaymentMethod,
} from "../types/paymentTypes";
import { parseAmountInput } from "./parseAmountInput";
import {
  changedDraftFields,
  draftFromPayment,
  type DraftField,
  type EditablePaymentFields,
  type RecordPaymentDraft,
} from "./recordPaymentForm";

/**
 * The pure half of editing and deleting a payment
 * (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3): which columns an edit writes,
 * how the change log words it, how the log names the payment, and whether a reason is acceptable.
 * The writes themselves are `db/editManualPayment.ts` and `db/deleteManualPayment.ts`.
 */

/** What these helpers need to know about a payment; the tab's rows have all of it. */
export type PaymentForEdit = EditablePaymentFields & {
  id: string;
  currency: string;
  entrySource: EntrySource;
};

/**
 * The columns an edit writes — only the ones that changed. Never an immutable column: the database
 * refuses a change to the event, currency, author, status, creation time, payer email or any Stripe
 * column (spec 07), and an upload it refuses is discarded.
 */
export type PaymentPatchColumns = Partial<{
  amount_cents: number;
  paid_at: string;
  payment_method_type: ManualPaymentMethod;
  payer_name: string;
  reference: string | null;
  notes: string | null;
  installment_id: string | null;
  intended_installment_id: string | null;
}>;

export type PaymentPatch = { changed: DraftField[]; columns: PaymentPatchColumns };

/**
 * What changed between a payment and a draft, as the columns that carry it.
 *
 * The installment is one choice written to BOTH columns, like recording a payment: the live link the
 * allocation reads and the historical fact. Left alone, neither is touched. The paid date is
 * anchored at noon so a timezone does not move the day, and only when the day itself changed.
 */
export function buildPaymentPatch(
  payment: PaymentForEdit,
  draft: RecordPaymentDraft,
): PaymentPatch {
  const changed = changedDraftFields(draftFromPayment(payment), draft);
  const columns: PaymentPatchColumns = {};

  for (const field of changed) {
    switch (field) {
      case "amount": {
        const parsed = parseAmountInput(draft.amountRaw);
        if (!parsed.ok) throw new Error("The amount is not a valid, non-zero amount.");
        columns.amount_cents = parsed.cents;
        break;
      }
      case "paidAt":
        columns.paid_at = new Date(`${draft.paidAtDate}T12:00:00`).toISOString();
        break;
      case "method":
        columns.payment_method_type = draft.method;
        break;
      case "payer":
        columns.payer_name = draft.payerName.trim();
        break;
      case "reference":
        columns.reference = draft.reference.trim() || null;
        break;
      case "notes":
        columns.notes = draft.notes.trim() || null;
        break;
      case "installment":
        columns.installment_id = draft.installmentId;
        columns.intended_installment_id = draft.installmentId;
        break;
    }
  }

  return { changed, columns };
}

const FIELD_LABELS_FOR_LOG: Record<DraftField, string> = {
  amount: "Amount",
  paidAt: "Paid date",
  method: "Method",
  payer: "Payer",
  reference: "Reference",
  notes: "Notes",
  installment: "Applied to",
};

/**
 * "Amount $100.00 · Method Check" → "Amount $120.00 · Method ACH Payment": the changed fields only,
 * before and after. Money is in the payment's own currency, which never changes.
 */
export function describePaymentChanges(
  payment: PaymentForEdit,
  draft: RecordPaymentDraft,
  changed: readonly DraftField[],
  installmentLabel: (installmentId: string | null) => string,
): { prev: string; next: string } {
  const currency = payment.currency as Currency;
  const before = draftFromPayment(payment);

  const value = (field: DraftField, d: RecordPaymentDraft): string => {
    switch (field) {
      case "amount": {
        const parsed = parseAmountInput(d.amountRaw);
        return parsed.ok ? formatMoney(parsed.cents, currency) : d.amountRaw.trim();
      }
      case "paidAt":
        return formatDate(d.paidAtDate);
      case "method":
        return PAYMENT_METHOD_LABELS[d.method];
      case "payer":
        return d.payerName.trim();
      case "reference":
        return d.reference.trim() || "—";
      case "notes":
        return d.notes.trim() || "—";
      case "installment":
        return installmentLabel(d.installmentId);
    }
  };

  const text = (d: RecordPaymentDraft) =>
    changed.map((field) => `${FIELD_LABELS_FOR_LOG[field]} ${value(field, d)}`).join(" · ");

  return { prev: text(before), next: text(draft) };
}

/** A payment in a line: "$100.00 · Check · Aug 14, 2026" — for the log and for LogTab. */
export function describePaymentForLog(
  payment: Pick<
    PaymentForEdit,
    "amountCents" | "currency" | "paymentMethodType" | "entrySource" | "paidAt" | "createdAt"
  >,
): string {
  return [
    formatMoney(payment.amountCents, payment.currency as Currency),
    paymentMethodLabel(payment.paymentMethodType, payment.entrySource),
    formatDate(payment.paidAt ?? payment.createdAt),
  ].join(" · ");
}

const PAYMENT_FIELD_PREFIX = "payment:";

/**
 * The log has no column for a payment's id, so it travels in `field_name` (spec 09, D1 C).
 * A plain `payment` names no payment.
 */
export function paymentLogFieldName(paymentId: string): string {
  return `${PAYMENT_FIELD_PREFIX}${paymentId}`;
}

export function parsePaymentLogFieldName(fieldName: string | null): string | null {
  if (!fieldName?.startsWith(PAYMENT_FIELD_PREFIX)) return null;
  return fieldName.slice(PAYMENT_FIELD_PREFIX.length) || null;
}

/** What LogTab calls the payment a log row is about: its description, or a short id if it is gone. */
export function paymentLogLabel(
  fieldName: string | null,
  payments: readonly (PaymentForEdit & { id: string })[],
): string {
  const id = parsePaymentLogFieldName(fieldName);
  if (!id) return "Payment";
  const found = payments.find((p) => p.id === id);
  return found ? describePaymentForLog(found) : `Payment ${id.slice(0, 8)}`;
}

/** The reason as it is stored: trimmed, or null when there is nothing left (spec 07, D2). */
export function normalizeDeleteReason(raw: string): string | null {
  return raw.trim() || null;
}

export function isAcceptableDeleteReason(raw: string): boolean {
  return normalizeDeleteReason(raw) !== null;
}
