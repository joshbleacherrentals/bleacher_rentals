import {
  MANUAL_PAYMENT_METHODS,
  REFERENCE_LABELS,
  type ManualPaymentMethod,
} from "../types/paymentTypes";
import { parseAmountInput, MAX_PAYMENT_CENTS } from "./parseAmountInput";
import { toEpochMs } from "./allocatePayments";

/**
 * Everything the Record Payment dialog decides, as a pure function of what has
 * been typed.
 *
 * The dialog itself then only renders this. Which matters because the
 * interesting rules here are not visual — zero is refused, tomorrow is refused,
 * a negative amount changes what the button says and puts a warning on screen —
 * and those are the rules worth testing directly rather than through a DOM.
 *
 * The same form edits a payment that was already recorded (`mode: "edit"`): the fields and the
 * rules are the same. What differs is that Save stays disabled until something has changed, and
 * that the currency is the payment's own and never changes, so it is never waited for.
 *
 * See docs/specs/manual-payment-entry.md §6.2, §6.3, T5 and
 * docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3.
 */

export type RecordPaymentDraft = {
  method: ManualPaymentMethod;
  amountRaw: string;
  /** YYYY-MM-DD. */
  paidAtDate: string;
  installmentId: string | null;
  payerName: string;
  reference: string;
  notes: string;
};

export type RecordPaymentFormState = {
  /** Signed cents, or null while the amount does not parse. */
  amountCents: number | null;
  isNegative: boolean;
  amountError: string | null;
  dateError: string | null;
  payerError: string | null;
  /** Set while the event's currency is still unknown — never a user's mistake. */
  currencyError: string | null;
  /** Edit mode only: the draft says what the payment already says. Always false when recording. */
  nothingChanged: boolean;
  canSubmit: boolean;
  submitLabel: string;
  referenceLabel: string;
};

/** What a payment looks like to the form: the fields the dialog collects, as the tab holds them. */
export type EditablePaymentFields = {
  amountCents: number;
  paidAt: string | null;
  createdAt: string;
  paymentMethodType: string | null;
  installmentId: string | null;
  payerName: string;
  reference: string | null;
  notes: string | null;
};

/** The fields of a draft, in the order the form lists them. */
export type DraftField =
  | "amount"
  | "paidAt"
  | "method"
  | "payer"
  | "reference"
  | "notes"
  | "installment";

export function emptyDraft(params: { payerName: string; today: string }): RecordPaymentDraft {
  return {
    method: MANUAL_PAYMENT_METHODS[2], // Check — the common case in the post
    amountRaw: "",
    paidAtDate: params.today,
    // Unapplied by default. Attaching money to an installment is a decision,
    // and a default would make it by accident.
    installmentId: null,
    payerName: params.payerName,
    reference: "",
    notes: "",
  };
}

/**
 * The calendar day a stored instant falls on, where the user is.
 *
 * The record dialog anchors the day it was given at noon local time, so reading it back in local
 * time gives that day again whatever the timezone. Handles both timestamp shapes the app sees
 * (PostgREST's and PowerSync's); an unreadable value gives "".
 */
function localDateOf(instant: string | null): string {
  const ms = toEpochMs(instant);
  if (ms === null) return "";
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Cents as the amount input holds them: signed, two decimals, no thousands separator. */
function amountInputOf(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** A draft holding what an existing payment already says — the starting point of an edit. */
export function draftFromPayment(payment: EditablePaymentFields): RecordPaymentDraft {
  const method = MANUAL_PAYMENT_METHODS.find((m) => m === payment.paymentMethodType);
  return {
    // A manual row always carries one of the three; the form has no other to offer.
    method: method ?? MANUAL_PAYMENT_METHODS[2],
    amountRaw: amountInputOf(payment.amountCents),
    paidAtDate: localDateOf(payment.paidAt ?? payment.createdAt),
    installmentId: payment.installmentId,
    payerName: payment.payerName,
    reference: payment.reference ?? "",
    notes: payment.notes ?? "",
  };
}

/**
 * Which fields of `draft` say something other than `original`, in the order the form lists them.
 *
 * Compared by meaning, not by spelling: "$2,700" is the amount "2700.00" already was, and
 * whitespace around a text field is not a change. An amount that does not parse counts as changed
 * — it is not what was there — and the form refuses it separately.
 */
export function changedDraftFields(
  original: RecordPaymentDraft,
  draft: RecordPaymentDraft,
): DraftField[] {
  const before = parseAmountInput(original.amountRaw);
  const after = parseAmountInput(draft.amountRaw);
  const amountSame = before.ok && after.ok && before.cents === after.cents;

  const changed: DraftField[] = [];
  if (!amountSame) changed.push("amount");
  if (original.paidAtDate !== draft.paidAtDate) changed.push("paidAt");
  if (original.method !== draft.method) changed.push("method");
  if (original.payerName.trim() !== draft.payerName.trim()) changed.push("payer");
  if (original.reference.trim() !== draft.reference.trim()) changed.push("reference");
  if (original.notes.trim() !== draft.notes.trim()) changed.push("notes");
  if (original.installmentId !== draft.installmentId) changed.push("installment");
  return changed;
}

const AMOUNT_ERRORS: Record<string, string> = {
  zero: "Amount cannot be zero. To reverse a payment, enter a negative amount.",
  "not-a-number": "Enter an amount, like 1,234.56 or -1,234.56.",
  "too-large": `Amount must be no more than $${(MAX_PAYMENT_CENTS / 100).toLocaleString("en-US")}.`,
};

/**
 * `currencyResolved` has no default on purpose.
 *
 * A default would be the wrong shape of safety: whichever value it took, a
 * caller that forgot the field would silently get it, and the failure this
 * guards against (§3.5, E5 — a row written in a currency the office had not
 * reported yet, excluded from every total, in an append-only ledger) is exactly
 * the kind nobody notices until reconciliation. Making it required moves that
 * from a runtime accident to a compile error.
 */
export type RecordPaymentFormOptions =
  | {
      mode?: "record";
      /** Whether `useEventCurrency` has a real answer yet, not just its fallback. */
      currencyResolved: boolean;
      isSubmitting?: boolean;
    }
  | {
      mode: "edit";
      /** What the payment said when the edit began; Save stays off until the draft differs. */
      original: RecordPaymentDraft;
      isSubmitting?: boolean;
    };

export function evaluateRecordPaymentForm(
  draft: RecordPaymentDraft,
  today: string,
  options: RecordPaymentFormOptions,
): RecordPaymentFormState {
  const parsed = parseAmountInput(draft.amountRaw);
  const amountCents = parsed.ok ? parsed.cents : null;

  // "empty" is not an error — nobody should be told off for a field they have
  // not reached yet. It just isn't submittable.
  const amountError = parsed.ok || parsed.reason === "empty" ? null : AMOUNT_ERRORS[parsed.reason];

  const dateError = draft.paidAtDate > today ? "A payment cannot be dated in the future." : null;
  const payerError = draft.payerName.trim() === "" ? "Who paid?" : null;

  const isNegative = amountCents !== null && amountCents < 0;

  const isEdit = options.mode === "edit";

  // Not phrased as something the user did wrong, because it isn't — they are
  // waiting on the office's currency, and the only thing they can do is wait.
  // An edit never waits: the payment's currency is already written and never changes.
  const currencyError =
    options.mode === "edit" || options.currencyResolved
      ? null
      : "Still loading this quote's currency. A payment has to be recorded in it, so this will enable in a moment.";

  const nothingChanged =
    options.mode === "edit" && changedDraftFields(options.original, draft).length === 0;

  return {
    amountCents,
    isNegative,
    amountError: amountError ?? null,
    dateError,
    payerError,
    currencyError,
    nothingChanged,
    canSubmit:
      !options.isSubmitting &&
      amountCents !== null &&
      draft.paidAtDate !== "" &&
      dateError === null &&
      payerError === null &&
      currencyError === null &&
      !nothingChanged,
    // A refund is not "a payment" and must not read like one on the button the
    // user is about to press. An edit saves what is already recorded, whichever way it points.
    submitLabel: isEdit
      ? "Save changes"
      : isNegative
        ? "Record Refund / Adjustment"
        : "Record Payment",
    referenceLabel: REFERENCE_LABELS[draft.method],
  };
}
