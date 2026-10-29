import { DateTime } from "luxon";
import type { PaymentHistoryRow } from "@/features/quotesAndBookings/hooks/usePaymentHistory";
import { paymentMethodLabel } from "@/features/quotesAndBookings/types/paymentTypes";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import { toEpochMs, type Allocation } from "@/features/quotesAndBookings/utils/allocatePayments";
import {
  isDeletedPayment,
  withoutDeleted,
} from "@/features/quotesAndBookings/utils/deletedPayments";
import { formatDate } from "@/features/quotesAndBookings/utils/formatDate";
import { formatMoney } from "@/features/quotesAndBookings/utils/formatMoney";
import type { CollectionsBalances } from "./collectionsBalances";
import { followUpLabel } from "./relativeDays";

/**
 * Pure builders that turn the data of the invoice page into display rows, so `useInvoiceData`
 * stays thin. docs/specs/accountant-collections-08-invoice-data.md §3.
 *
 * Times are written in the office's time zone, not the browser's.
 */

// ---------------------------------------------------------------- money

export type MoneyView = {
  contractSubtotalCents: number;
  taxesLabel: string;
  taxesCents: number;
  totalCents: number;
  alreadyPaidCents: number;
  remainingCents: number;
  /** The Amount Due of the twin. */
  currentOverdueCents: number;
};

/** `lineTotalCents` is the Contract Subtotal: the line items after discounts, before tax. */
export function buildMoney(
  balances: Pick<
    CollectionsBalances,
    "totalCents" | "receivedCents" | "remainingCents" | "amountDueCents"
  >,
  lineTotalCents: number,
  taxPercent: number | null,
): MoneyView {
  return {
    contractSubtotalCents: lineTotalCents,
    taxesLabel: taxPercent === null ? "Taxes" : `Taxes (${taxPercent}%)`,
    taxesCents: balances.totalCents - lineTotalCents,
    totalCents: balances.totalCents,
    alreadyPaidCents: balances.receivedCents,
    remainingCents: balances.remainingCents,
    currentOverdueCents: balances.amountDueCents,
  };
}

// ------------------------------------------------------------- schedule

export type ScheduleRow = {
  number: number;
  dueDate: string;
  amountCents: number;
  amount: string;
  status: "Paid" | "Partial" | "Unpaid";
  /** `C$1,500.00 of C$3,235.75` for a Partial row, otherwise null. */
  partialText: string | null;
  /** When the installment was completed; only for a Paid row. */
  paidAt: string | null;
};

const STATUS_LABELS = { paid: "Paid", partial: "Partial", unpaid: "Unpaid" } as const;

function inZone(value: string, timezone: string): DateTime {
  return DateTime.fromISO(value.trim().replace(" ", "T"), { zone: timezone }).setLocale("en-US");
}

function zonedDate(value: string | null, timezone: string): string {
  if (!value) return "—";
  const dt = inZone(value, timezone);
  return dt.isValid ? dt.toFormat("MMM d, yyyy") : "—";
}

function zonedTime(value: string | null, timezone: string): string {
  if (!value) return "";
  const dt = inZone(value, timezone);
  return dt.isValid ? dt.toFormat("h:mm a") : "";
}

export function buildScheduleRows(
  allocation: Allocation,
  currency: Currency,
  timezone: string,
): ScheduleRow[] {
  return allocation.installments.map((inst, i) => ({
    number: i + 1,
    dueDate: formatDate(inst.dueDate),
    amountCents: inst.amountCents,
    amount: formatMoney(inst.amountCents, currency),
    status: STATUS_LABELS[inst.status],
    partialText:
      inst.status === "partial"
        ? `${formatMoney(inst.allocatedCents, currency)} of ${formatMoney(inst.amountCents, currency)}`
        : null,
    paidAt:
      inst.status === "paid" && inst.paidAt
        ? `${zonedDate(inst.paidAt, timezone)} at ${zonedTime(inst.paidAt, timezone)}`
        : null,
  }));
}

// -------------------------------------------------------------- payments

export type PaymentRow = {
  id: string;
  number: number;
  date: string;
  time: string;
  amountCents: number;
  amount: string;
  method: string;
  payer: string;
  isManual: boolean;
  isDeleted: boolean;
  /** The row itself, for `PaymentDetailDialog`. */
  payment: PaymentHistoryRow;
};

/** When the money arrived, as far as the row says. */
function paymentMoment(p: PaymentHistoryRow): string {
  return p.paidAt ?? p.createdAt;
}

function byMoment(a: PaymentHistoryRow, b: PaymentHistoryRow): number {
  const infinity = Number.POSITIVE_INFINITY;
  const left = toEpochMs(paymentMoment(a)) ?? infinity;
  const right = toEpochMs(paymentMoment(b)) ?? infinity;
  if (left !== right) return left < right ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Oldest first, numbered from 1 over the rows listed: with Show deleted off a deleted payment is
 * left out before numbering, with it on it is listed and numbered like the others.
 */
export function buildPaymentRows(
  payments: readonly PaymentHistoryRow[],
  showDeleted: boolean,
  timezone: string,
): PaymentRow[] {
  const listed = showDeleted ? [...payments] : withoutDeleted(payments);
  return listed.sort(byMoment).map((p, i) => ({
    id: p.id,
    number: i + 1,
    date: zonedDate(paymentMoment(p), timezone),
    time: zonedTime(paymentMoment(p), timezone),
    amountCents: p.amountCents,
    amount: formatMoney(p.amountCents, p.currency as Currency),
    method: paymentMethodLabel(p.paymentMethodType, p.entrySource),
    payer: p.payerName,
    isManual: p.entrySource === "manual",
    isDeleted: isDeletedPayment(p),
    payment: p,
  }));
}

// ----------------------------------------------------------------- tasks

/** A row of the task query of `useInvoiceData`. */
export type InvoiceTaskRow = {
  id: string;
  created_at: string | null;
  due_date: string | null;
  note: string | null;
  completed: number | null;
};

export type TaskView = {
  id: string;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  note: string;
  followUpLabel: string;
};

function toTaskView(t: InvoiceTaskRow, today: string): TaskView {
  const dueDate = (t.due_date ?? "").slice(0, 10);
  return { id: t.id, dueDate, note: t.note ?? "", followUpLabel: followUpLabel(dueDate, today) };
}

/** Of two tasks, the one created last; the id breaks a tie so the order never flips. */
function newestFirst(a: InvoiceTaskRow, b: InvoiceTaskRow): number {
  const byCreated = (b.created_at ?? "").localeCompare(a.created_at ?? "");
  return byCreated !== 0 ? byCreated : b.id.localeCompare(a.id);
}

/**
 * The open task, and the completed ones newest due date first. The table has no completion date,
 * so a completed task shows its due date in words.
 */
export function buildTaskLists(
  tasks: readonly InvoiceTaskRow[],
  today: string,
): { open: TaskView | null; completed: TaskView[] } {
  const open = tasks.filter((t) => !t.completed).sort(newestFirst)[0];
  const completed = tasks
    .filter((t) => !!t.completed)
    .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? "") || newestFirst(a, b));
  return {
    open: open ? toTaskView(open, today) : null,
    completed: completed.map((t) => toTaskView(t, today)),
  };
}

// -------------------------------------------------------------- contacts

export type ContactInput = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

/** A `Companies` row, as the company query of `useInvoiceData` reads it. */
export type CompanyInput = {
  company_name: string | null;
  phone: string | null;
  email: string | null;
};

export type ContactCard = {
  name: string;
  phone: string | null;
  email: string | null;
  company: { name: string | null; phone: string | null; email: string | null } | null;
};

/** No contact, no card; no company, no company lines. */
export function buildContactCard(
  contact: ContactInput | null,
  company: CompanyInput | null,
): ContactCard | null {
  if (!contact) return null;
  return {
    name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    phone: contact.phone,
    email: contact.email,
    company: company
      ? { name: company.company_name, phone: company.phone, email: company.email }
      : null,
  };
}
