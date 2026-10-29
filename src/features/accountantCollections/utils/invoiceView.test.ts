import { describe, it, expect } from "vitest";
import type { PaymentHistoryRow } from "@/features/quotesAndBookings/hooks/usePaymentHistory";
import type { ReceivablePaymentRow } from "@/features/quotesAndBookings/utils/accountsReceivable";
import { computeCollectionsBalances } from "./collectionsBalances";
import {
  buildContactCard,
  buildMoney,
  buildPaymentRows,
  buildScheduleRows,
  buildTaskLists,
  type InvoiceTaskRow,
} from "./invoiceView";

// Spec: docs/specs/accountant-collections-08-invoice-data.md §3 and §4. The numbers are the
// author's sketch: four installments of 3,235.75 (C$), the first paid, the second part-paid
// with 1,500.00.

const TODAY = "2026-11-15";
const TZ = "America/Toronto";
const LINE_TOTAL = 1_125_478; // + 15% tax (168,822) = 1,294,300 = 4 × 323,575

const installments = [
  ["i-1", "2026-09-01"],
  ["i-2", "2026-10-01"],
  ["i-3", "2026-11-01"],
  ["i-4", "2026-12-01"],
].map(([id, due]) => ({ id, event_uuid: "e-1", due_date: due, percentage_bps: 2500 }));

function history(over: Partial<PaymentHistoryRow> & { id: string }): PaymentHistoryRow {
  return {
    installmentId: null,
    amountCents: 0,
    currency: "CAD",
    status: "succeeded",
    paymentMethodType: null,
    payerName: "Jane Doe",
    payerEmail: null,
    notes: null,
    receiptUrl: null,
    paidAt: null,
    createdAt: "2026-09-03T18:30:00+00:00",
    intendedInstallmentId: null,
    entrySource: "stripe",
    recordedByUserUuid: null,
    reference: null,
    deletedAt: null,
    deletedByUserUuid: null,
    deleteReason: null,
    ...over,
  };
}

const stripePayment = history({
  id: "p-stripe",
  amountCents: 323_575,
  paymentMethodType: "stripe",
  paidAt: "2026-09-03T18:30:00+00:00",
});
const checkPayment = history({
  id: "p-check",
  amountCents: 150_000,
  paymentMethodType: "check",
  entrySource: "manual",
  payerName: "Acme Ltd",
  paidAt: "2026-10-05T15:00:00+00:00",
  createdAt: "2026-10-05T15:01:00+00:00",
  reference: "1042",
});
const deletedPayment = history({
  id: "p-deleted",
  amountCents: 50_000,
  paymentMethodType: "ach",
  entrySource: "manual",
  paidAt: "2026-10-20T15:00:00+00:00",
  createdAt: "2026-10-20T15:01:00+00:00",
  deletedAt: "2026-10-21T09:00:00+00:00",
});

const toReceivable = (p: PaymentHistoryRow): ReceivablePaymentRow => ({
  id: p.id,
  event_uuid: "e-1",
  installment_id: p.installmentId,
  amount_cents: p.amountCents,
  currency: p.currency,
  status: p.status,
  paid_at: p.paidAt,
  created_at: p.createdAt,
  deleted_at: p.deletedAt,
});

const balances = computeCollectionsBalances({
  event: {
    event_start: "2027-06-01",
    booked_at: "2026-08-01T12:00:00+00:00",
    tax_percent: 15,
    tax_amount_cents: null,
  },
  lineTotalCents: LINE_TOTAL,
  installments,
  payments: [stripePayment, checkPayment, deletedPayment].map(toReceivable),
  currency: "CAD",
  today: TODAY,
});

describe("buildMoney", () => {
  it("lays out the six money lines with the tax rate in the label", () => {
    expect(buildMoney(balances, LINE_TOTAL, 15)).toEqual({
      contractSubtotalCents: 1_125_478,
      taxesLabel: "Taxes (15%)",
      taxesCents: 168_822,
      totalCents: 1_294_300,
      alreadyPaidCents: 473_575,
      remainingCents: 820_725,
      currentOverdueCents: 497_150,
    });
  });

  it("leaves the rate out of the label when the event has none", () => {
    expect(buildMoney(balances, LINE_TOTAL, null).taxesLabel).toBe("Taxes");
  });

  it("does not count the deleted payment in Already paid or in the overdue amount", () => {
    const money = buildMoney(balances, LINE_TOTAL, 15);
    expect(money.alreadyPaidCents).toBe(323_575 + 150_000);
    expect(money.currentOverdueCents).toBe(173_575 + 323_575);
  });
});

describe("buildScheduleRows", () => {
  const rows = buildScheduleRows(balances.allocation, "CAD", TZ);

  it("numbers the installments from 1 with their due date and amount", () => {
    expect(rows.map((r) => [r.number, r.dueDate, r.amount])).toEqual([
      [1, "Sep 1, 2026", "C$3,235.75"],
      [2, "Oct 1, 2026", "C$3,235.75"],
      [3, "Nov 1, 2026", "C$3,235.75"],
      [4, "Dec 1, 2026", "C$3,235.75"],
    ]);
  });

  it("says Paid, Partial with 'X of Y', or Unpaid", () => {
    expect(rows.map((r) => r.status)).toEqual(["Paid", "Partial", "Unpaid", "Unpaid"]);
    expect(rows[1].partialText).toBe("C$1,500.00 of C$3,235.75");
    expect(rows[0].partialText).toBeNull();
    expect(rows[2].partialText).toBeNull();
  });

  it("gives Paid at only for a paid installment, in the office's time zone", () => {
    expect(rows.map((r) => r.paidAt)).toEqual(["Sep 3, 2026 at 2:30 PM", null, null, null]);
  });

  it("is empty when the event has no payment schedule", () => {
    const none = computeCollectionsBalances({
      event: {
        event_start: "2027-06-01",
        booked_at: null,
        tax_percent: null,
        tax_amount_cents: null,
      },
      lineTotalCents: 1000,
      installments: [],
      payments: [],
      currency: "CAD",
      today: TODAY,
    });
    expect(buildScheduleRows(none.allocation, "CAD", TZ)).toEqual([]);
  });
});

describe("buildPaymentRows", () => {
  // Handed over newest first, as `usePaymentHistory` returns them.
  const all = [deletedPayment, checkPayment, stripePayment];

  it("lists Stripe first and then the check, oldest first, numbered from 1", () => {
    const rows = buildPaymentRows(all, false, TZ);
    expect(
      rows.map((r) => [r.number, r.date, r.time, r.amount, r.method, r.payer, r.isManual]),
    ).toEqual([
      [1, "Sep 3, 2026", "2:30 PM", "C$3,235.75", "Stripe", "Jane Doe", false],
      [2, "Oct 5, 2026", "11:00 AM", "C$1,500.00", "Check", "Acme Ltd", true],
    ]);
  });

  it("hides a deleted payment while Show deleted is off", () => {
    const rows = buildPaymentRows(all, false, TZ);
    expect(rows.map((r) => r.id)).toEqual(["p-stripe", "p-check"]);
    expect(rows.every((r) => !r.isDeleted)).toBe(true);
  });

  it("lists, flags and numbers a deleted payment when Show deleted is on", () => {
    const rows = buildPaymentRows(all, true, TZ);
    expect(rows.map((r) => [r.number, r.id, r.isDeleted])).toEqual([
      [1, "p-stripe", false],
      [2, "p-check", false],
      [3, "p-deleted", true],
    ]);
  });

  it("numbers the rows listed with no gap when a deleted one sits in the middle", () => {
    const early = history({
      id: "p-early-deleted",
      amountCents: 1000,
      paidAt: "2026-09-10T15:00:00+00:00",
      deletedAt: "2026-09-11T09:00:00+00:00",
    });
    const off = buildPaymentRows([...all, early], false, TZ);
    expect(off.map((r) => r.number)).toEqual([1, 2]);
    const on = buildPaymentRows([...all, early], true, TZ);
    expect(on.map((r) => [r.number, r.id])).toEqual([
      [1, "p-stripe"],
      [2, "p-early-deleted"],
      [3, "p-check"],
      [4, "p-deleted"],
    ]);
  });

  it("carries the payment row itself for the detail dialog", () => {
    const [first] = buildPaymentRows(all, false, TZ);
    expect(first.payment).toBe(stripePayment);
  });

  it("shows a refund with its minus sign", () => {
    const refund = history({ id: "p-refund", amountCents: -2500, paidAt: "2026-10-30T15:00:00Z" });
    const rows = buildPaymentRows([refund], false, TZ);
    expect(rows[0].amount).toBe("-C$25.00");
    expect(rows[0].amountCents).toBe(-2500);
  });

  it("dates a payment without paid_at by its creation time", () => {
    const pending = history({ id: "p-new", amountCents: 100, paidAt: null });
    const [row] = buildPaymentRows([pending], false, TZ);
    expect(row.date).toBe("Sep 3, 2026");
  });
});

describe("buildTaskLists", () => {
  const task = (over: Partial<InvoiceTaskRow> & { id: string }): InvoiceTaskRow => ({
    created_at: "2026-10-01T05:20:00.000Z",
    due_date: "2026-11-15",
    note: "Remind the customer about payment",
    completed: 0,
    ...over,
  });

  const tasks = [
    task({ id: "t-old", completed: 1, due_date: "2026-09-01" }),
    task({ id: "t-new", completed: 1, due_date: "2026-11-01" }),
    task({ id: "t-mid", completed: 1, due_date: "2026-10-01" }),
    task({ id: "t-open", due_date: "2026-11-17", note: "Call the accountant" }),
  ];

  it("puts the open task apart, with its date in words", () => {
    const { open } = buildTaskLists(tasks, TODAY);
    expect(open).toEqual({
      id: "t-open",
      dueDate: "2026-11-17",
      note: "Call the accountant",
      followUpLabel: "2 days after",
    });
  });

  it("lists the completed tasks newest due date first, each with its date in words", () => {
    const { completed } = buildTaskLists(tasks, TODAY);
    expect(completed.map((t) => [t.id, t.followUpLabel])).toEqual([
      ["t-new", "14 days ago"],
      ["t-mid", "Month ago"],
      ["t-old", "2 Months ago"],
    ]);
  });

  it("has no open task when every task is completed", () => {
    expect(buildTaskLists(tasks.slice(0, 3), TODAY).open).toBeNull();
  });

  it("takes the newest as the open task if two exist", () => {
    const two = [
      task({ id: "t-a", created_at: "2026-10-01T05:20:00.000Z" }),
      task({ id: "t-b", created_at: "2026-10-02T05:20:00.000Z" }),
    ];
    expect(buildTaskLists(two, TODAY).open?.id).toBe("t-b");
  });

  it("is empty for an event with no tasks", () => {
    expect(buildTaskLists([], TODAY)).toEqual({ open: null, completed: [] });
  });
});

describe("buildContactCard", () => {
  const contact = {
    id: "c-1",
    firstName: "Ann",
    lastName: "Lee",
    email: "ann@example.com",
    phone: "555-0100",
  };
  const company = { company_name: "Acme Ltd", phone: "555-0199", email: "office@acme.example" };

  it("shows the contact with the company's name, number and email", () => {
    expect(buildContactCard(contact, company)).toEqual({
      name: "Ann Lee",
      phone: "555-0100",
      email: "ann@example.com",
      company: { name: "Acme Ltd", phone: "555-0199", email: "office@acme.example" },
    });
  });

  it("leaves the company lines out for a contact with no company", () => {
    expect(buildContactCard(contact, null)?.company).toBeNull();
  });

  it("leaves the card out when there is no contact (no finance contact)", () => {
    expect(buildContactCard(null, null)).toBeNull();
  });

  it("shows what it has for a contact with only a first name", () => {
    expect(
      buildContactCard({ ...contact, lastName: null, email: null, phone: null }, null),
    ).toEqual({
      name: "Ann",
      phone: null,
      email: null,
      company: null,
    });
  });
});
