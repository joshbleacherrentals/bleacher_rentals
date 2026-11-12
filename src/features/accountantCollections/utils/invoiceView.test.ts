import { describe, it, expect } from "vitest";
import type { PaymentHistoryRow } from "@/features/quotesAndBookings/hooks/usePaymentHistory";
import type { ReceivablePaymentRow } from "@/features/quotesAndBookings/utils/accountsReceivable";
import { computeCollectionsBalances } from "./collectionsBalances";
import {
  buildContactCard,
  buildMoney,
  buildPaymentRows,
  buildScheduleRows,
  buildTaskHistory,
  buildSignedLine,
  buildTaskLists,
  finishedLabel,
  zonedMoment,
  type BookedLogRow,
  type InvoiceTaskRow,
  type SignatureRow,
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
    finished_at: null,
    ...over,
  });

  const tasks = [
    task({ id: "t-old", completed: 1, due_date: "2026-09-01" }),
    task({ id: "t-new", completed: 1, due_date: "2026-11-01" }),
    task({ id: "t-mid", completed: 1, due_date: "2026-10-01" }),
    task({ id: "t-open", due_date: "2026-11-17", note: "Call the accountant" }),
  ];

  it("puts the open task apart, with its date in words", () => {
    const { open } = buildTaskLists(tasks, TODAY, TZ);
    expect(open).toEqual({
      id: "t-open",
      dueDate: "2026-11-17",
      note: "Call the accountant",
      followUpLabel: "2 days after",
      finishedLabel: "—",
    });
  });

  it("lists the completed tasks newest due date first, each with its date in words", () => {
    const { completed } = buildTaskLists(tasks, TODAY, TZ);
    expect(completed.map((t) => [t.id, t.followUpLabel])).toEqual([
      ["t-new", "14 days ago"],
      ["t-mid", "Month ago"],
      ["t-old", "2 Months ago"],
    ]);
  });

  it("has no open task when every task is completed", () => {
    expect(buildTaskLists(tasks.slice(0, 3), TODAY, TZ).open).toBeNull();
  });

  it("takes the newest as the open task if two exist", () => {
    const two = [
      task({ id: "t-a", created_at: "2026-10-01T05:20:00.000Z" }),
      task({ id: "t-b", created_at: "2026-10-02T05:20:00.000Z" }),
    ];
    expect(buildTaskLists(two, TODAY, TZ).open?.id).toBe("t-b");
  });

  it("is empty for an event with no tasks", () => {
    expect(buildTaskLists([], TODAY, TZ)).toEqual({ open: null, completed: [] });
  });

  // docs/specs/accountant-collections-18-task-finished-at.md §1 (D1, D3) and §5.
  it("gives each completed task its finish date as DD/MM/YYYY, in the office's time zone", () => {
    const { completed } = buildTaskLists(
      [
        task({
          id: "t-a",
          completed: 1,
          due_date: "2026-11-01",
          finished_at: "2026-11-09T15:00:00Z",
        }),
        task({
          id: "t-b",
          completed: 1,
          due_date: "2026-10-01",
          finished_at: "2026-10-02 09:30:00+00",
        }),
      ],
      TODAY,
      TZ,
    );
    expect(completed.map((t) => [t.id, t.finishedLabel])).toEqual([
      ["t-a", "09/11/2026"],
      ["t-b", "02/10/2026"],
    ]);
  });

  it("shows a dash for a completed task that has no finish time (D2)", () => {
    const { completed } = buildTaskLists(
      [task({ id: "t-old", completed: 1, finished_at: null })],
      TODAY,
      TZ,
    );
    expect(completed[0].finishedLabel).toBe("—");
  });

  it("shows a dash for the open task, even if a value were there", () => {
    const { open } = buildTaskLists(
      [task({ id: "t-open", finished_at: "2026-11-09T15:00:00Z" })],
      TODAY,
      TZ,
    );
    expect(open?.finishedLabel).toBe("—");
  });

  it("takes the day in the zone it is given: the same instant is two office days", () => {
    const rows = [task({ id: "t-1", completed: 1, finished_at: "2026-11-10T03:30:00Z" })];
    // 03:30 UTC is 22:30 of the 9th in Toronto (EST, UTC-5) and already the 10th in UTC.
    expect(buildTaskLists(rows, TODAY, "America/Toronto").completed[0].finishedLabel).toBe(
      "09/11/2026",
    );
    expect(buildTaskLists(rows, TODAY, "UTC").completed[0].finishedLabel).toBe("10/11/2026");
  });
});

// docs/specs/accountant-collections-18-task-finished-at.md §3 and §5: D3, the date, not words.
describe("finishedLabel", () => {
  it("is a dash for no value, an empty text and a text that is not a date", () => {
    expect(finishedLabel(null, TZ)).toBe("—");
    expect(finishedLabel("", TZ)).toBe("—");
    expect(finishedLabel("   ", TZ)).toBe("—");
    expect(finishedLabel("not a date", TZ)).toBe("—");
  });

  it("writes day, month and year as DD/MM/YYYY", () => {
    expect(finishedLabel("2026-11-09T15:00:00.000Z", TZ)).toBe("09/11/2026");
  });

  it("pads a single-digit day and month to two digits", () => {
    expect(finishedLabel("2026-01-05T17:00:00Z", TZ)).toBe("05/01/2026");
  });

  it("reads the instant with Z, with +00 and with a space instead of T", () => {
    expect(finishedLabel("2026-11-09T15:00:00Z", TZ)).toBe("09/11/2026");
    expect(finishedLabel("2026-11-09T15:00:00+00", TZ)).toBe("09/11/2026");
    expect(finishedLabel("2026-11-09 15:00:00+00", TZ)).toBe("09/11/2026");
  });

  it("takes the office's day, not UTC's, near midnight", () => {
    // 23:30 in Toronto on the 9th is 04:30 UTC on the 10th (EST, UTC-5).
    expect(finishedLabel("2026-11-10T04:30:00Z", "America/Toronto")).toBe("09/11/2026");
    expect(finishedLabel("2026-11-10T04:30:00Z", "UTC")).toBe("10/11/2026");
    // 00:30 in Toronto on the 10th is 05:30 UTC the same day: both agree.
    expect(finishedLabel("2026-11-10T05:30:00Z", "America/Toronto")).toBe("10/11/2026");
  });

  it("shows a moment later than today as its own date", () => {
    expect(finishedLabel("2026-11-20T15:00:00Z", TZ)).toBe("20/11/2026");
  });
});

// docs/specs/accountant-collections-13-task-history-and-files.md §1, §3 and §5.
describe("buildTaskHistory", () => {
  const task = (over: Partial<InvoiceTaskRow> & { id: string }): InvoiceTaskRow => ({
    created_at: "2026-10-01T05:20:00.000Z",
    due_date: "2026-11-15",
    note: "Remind the customer about payment",
    completed: 1,
    finished_at: null,
    ...over,
  });
  const history = (tasks: InvoiceTaskRow[]) => buildTaskHistory(buildTaskLists(tasks, TODAY, TZ));

  it("lists the completed tasks oldest first and the open task last, numbered 1 to n", () => {
    const rows = history([
      task({ id: "t-new", due_date: "2026-11-01" }),
      task({ id: "t-open", due_date: "2026-11-17", completed: 0 }),
      task({ id: "t-old", due_date: "2026-09-01" }),
      task({ id: "t-mid", due_date: "2026-10-01" }),
    ]);
    expect(rows.map((r) => [r.number, r.id, r.isOpen])).toEqual([
      [1, "t-old", false],
      [2, "t-mid", false],
      [3, "t-new", false],
      [4, "t-open", true],
    ]);
  });

  it("puts the open task last even when it is dated before a completed one", () => {
    const rows = history([
      task({ id: "t-done", due_date: "2026-11-20" }),
      task({ id: "t-open", due_date: "2026-11-10", completed: 0 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["t-done", "t-open"]);
  });

  it("puts the task created first first when two completed tasks share a date", () => {
    const rows = history([
      task({ id: "t-second", created_at: "2026-10-02T05:20:00.000Z", due_date: "2026-11-01" }),
      task({ id: "t-first", created_at: "2026-10-01T05:20:00.000Z", due_date: "2026-11-01" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["t-first", "t-second"]);
  });

  it("writes each date in the list's wording: past, today, tomorrow and future", () => {
    const labelOf = (dueDate: string, completed: number) =>
      history([task({ id: "t-1", due_date: dueDate, completed })])[0].dateLabel;
    expect(labelOf("2026-11-04", 1)).toBe("11 days ago");
    expect(labelOf("2026-10-15", 1)).toBe("Month ago");
    expect(labelOf("2026-11-15", 0)).toBe("Due Today");
    expect(labelOf("2026-11-16", 0)).toBe("Due tomorrow");
    expect(labelOf("2026-11-18", 0)).toBe("3 days after");
    expect(labelOf("2026-11-12", 0)).toBe("3 days ago");
  });

  it("carries the finish date of each completed task and a dash for the open one (spec 18)", () => {
    const rows = history([
      task({ id: "t-old", due_date: "2026-10-01", finished_at: "2026-10-02T14:00:00Z" }),
      task({ id: "t-none", due_date: "2026-10-15", finished_at: null }),
      task({ id: "t-open", due_date: "2026-11-17", completed: 0 }),
    ]);
    expect(rows.map((r) => [r.id, r.finishedLabel])).toEqual([
      ["t-old", "02/10/2026"],
      ["t-none", "—"],
      ["t-open", "—"],
    ]);
  });

  it("carries the note of each task", () => {
    const [row] = history([task({ id: "t-1", note: "Call the accountant" })]);
    expect(row.note).toBe("Call the accountant");
  });

  // docs/specs/accountant-collections-19-task-delete.md §3 and §5.
  it("lets every completed task be deleted and the open task not (spec 19)", () => {
    const rows = history([
      task({ id: "t-old", due_date: "2026-09-01" }),
      task({ id: "t-new", due_date: "2026-11-01" }),
      task({ id: "t-open", due_date: "2026-11-17", completed: 0 }),
    ]);
    expect(rows.map((r) => [r.id, r.canDelete])).toEqual([
      ["t-old", true],
      ["t-new", true],
      ["t-open", false],
    ]);
  });

  it("lets a completed task with no finish time be deleted, and a lone open task not (spec 19)", () => {
    expect(history([task({ id: "t-1", finished_at: null })])[0].canDelete).toBe(true);
    expect(history([task({ id: "t-open", completed: 0 })])[0].canDelete).toBe(false);
  });

  it("says canDelete exactly when the row is not the open one (spec 19)", () => {
    const rows = history([
      task({ id: "t-1", due_date: "2026-10-01" }),
      task({ id: "t-2", due_date: "2026-10-15" }),
      task({ id: "t-open", completed: 0 }),
    ]);
    expect(rows.map((r) => r.canDelete)).toEqual(rows.map((r) => !r.isOpen));
  });

  it("is only the open task when nothing is completed", () => {
    const rows = history([task({ id: "t-open", completed: 0 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ number: 1, id: "t-open", isOpen: true });
  });

  it("is only completed tasks when none is open", () => {
    const rows = history([task({ id: "t-1" }), task({ id: "t-2", due_date: "2026-11-01" })]);
    expect(rows.map((r) => r.isOpen)).toEqual([false, false]);
    expect(rows.map((r) => r.id)).toEqual(["t-2", "t-1"]);
  });

  it("is empty for an event with no tasks", () => {
    expect(history([])).toEqual([]);
  });

  it("does not change the lists it was given", () => {
    const lists = buildTaskLists(
      [
        task({ id: "t-new", due_date: "2026-11-01" }),
        task({ id: "t-old", due_date: "2026-09-01" }),
      ],
      TODAY,
      TZ,
    );
    buildTaskHistory(lists);
    expect(lists.completed.map((t) => t.id)).toEqual(["t-new", "t-old"]);
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

// docs/specs/accountant-collections-20-signed-booked-line.md §3 and §5: the time of the Signed /
// Booked line, in the office's zone with the zone's short name.
describe("zonedMoment", () => {
  it("writes 'MMM d, yyyy at h:mm a' and the zone's short name in summer (EDT)", () => {
    expect(zonedMoment("2026-07-15T18:00:00.000Z", "America/Toronto")).toBe(
      "Jul 15, 2026 at 2:00 PM EDT",
    );
  });

  it("writes the winter name (EST) for a winter moment", () => {
    expect(zonedMoment("2026-01-15T18:00:00.000Z", "America/Toronto")).toBe(
      "Jan 15, 2026 at 1:00 PM EST",
    );
  });

  it("takes the office's day and clock near midnight, not UTC's", () => {
    // 04:30 UTC on the 10th is 23:30 on the 9th in Toronto (EST, UTC-5).
    expect(zonedMoment("2026-11-10T04:30:00.000Z", "America/Toronto")).toBe(
      "Nov 9, 2026 at 11:30 PM EST",
    );
    expect(zonedMoment("2026-11-10T04:30:00.000Z", "UTC")).toBe("Nov 10, 2026 at 4:30 AM UTC");
    // One minute before and exactly at the office's midnight in summer (EDT, UTC-4).
    expect(zonedMoment("2026-07-01T03:59:00.000Z", "America/Toronto")).toBe(
      "Jun 30, 2026 at 11:59 PM EDT",
    );
    expect(zonedMoment("2026-07-01T04:00:00.000Z", "America/Toronto")).toBe(
      "Jul 1, 2026 at 12:00 AM EDT",
    );
  });

  it("reads both spellings of a stored time", () => {
    expect(zonedMoment("2026-11-03 14:15:00+00", "America/Toronto")).toBe(
      "Nov 3, 2026 at 9:15 AM EST",
    );
    expect(zonedMoment("2026-11-03T14:15:00.000Z", "America/Toronto")).toBe(
      "Nov 3, 2026 at 9:15 AM EST",
    );
  });

  it("gives an empty text for no value, an empty text and a text that is not a time", () => {
    expect(zonedMoment(null, TZ)).toBe("");
    expect(zonedMoment("", TZ)).toBe("");
    expect(zonedMoment("   ", TZ)).toBe("");
    expect(zonedMoment("not a time", TZ)).toBe("");
  });

  it("never throws for a zone with no short name; luxon writes an offset", () => {
    expect(zonedMoment("2026-07-15T18:00:00.000Z", "Europe/Kyiv")).toMatch(
      /^Jul 15, 2026 at 9:00 PM GMT\+3$/,
    );
  });
});

describe("buildSignedLine", () => {
  const staffNames = new Map([
    ["user-7", "Max Gavryshkiv"],
    ["user-8", "Sam Lee"],
  ]);
  const signature = (over: Partial<SignatureRow> = {}): SignatureRow => ({
    signer_name: "Dana Whitfield",
    signed_at: "2026-10-22T19:14:00.000Z",
    ...over,
  });
  const bookedLog = (over: Partial<BookedLogRow> = {}): BookedLogRow => ({
    changed_by_user_uuid: "user-7",
    changed_at: "2026-11-03T14:15:00.000Z",
    ...over,
  });
  const build = (over: Partial<Parameters<typeof buildSignedLine>[0]> = {}) =>
    buildSignedLine({
      signatures: [],
      bookedLogs: [],
      eventStatus: "booked",
      bookedAt: null,
      staffNames,
      timezone: TZ,
      ...over,
    });

  it("is Signed with the date, the time with its zone and the signer, for an active signature", () => {
    expect(build({ signatures: [signature()] })).toEqual({
      label: "Signed",
      text: "Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield",
    });
  });

  it("is Signed whatever the event's status is: the signature is what counts", () => {
    for (const eventStatus of ["booked", "unsigned_changes", "quoted", "lost", null]) {
      expect(build({ signatures: [signature()], eventStatus })?.label).toBe("Signed");
    }
  });

  it("is Booked for a booked event with no signature: the time and the manager of the log row", () => {
    expect(build({ bookedLogs: [bookedLog()] })).toEqual({
      label: "Booked",
      text: "Nov 3, 2026 at 9:15 AM EST by Max Gavryshkiv",
    });
  });

  it("is Signed when both exist: the user's wording", () => {
    expect(build({ signatures: [signature()], bookedLogs: [bookedLog()] })).toEqual({
      label: "Signed",
      text: "Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield",
    });
  });

  it("has no line for an event with neither a signature nor a booking", () => {
    expect(build({ eventStatus: "quoted" })).toBeNull();
    expect(build({ eventStatus: "draft" })).toBeNull();
    expect(build({ eventStatus: null })).toBeNull();
  });

  it("has no line for an event that is not booked, even with a booked log row of the past", () => {
    for (const eventStatus of ["lost", "quoted", "unsigned_changes", "draft", null]) {
      expect(
        build({ eventStatus, bookedLogs: [bookedLog()], bookedAt: "2026-08-01T12:00:00+00:00" }),
        String(eventStatus),
      ).toBeNull();
    }
  });

  it("takes the latest of several signatures by time, in both spellings of a time", () => {
    // As text "…T10:00…" sorts after "… 18:00…" ('T' is after a space), but 18:00 is later.
    const earlier = signature({
      signer_name: "Early Signer",
      signed_at: "2026-10-22T10:00:00.000Z",
    });
    const later = signature({ signer_name: "Late Signer", signed_at: "2026-10-22 18:00:00+00" });

    expect(build({ signatures: [earlier, later] })?.text).toBe(
      "Oct 22, 2026 at 2:00 PM EDT by Late Signer",
    );
    expect(build({ signatures: [later, earlier] })?.text).toBe(
      "Oct 22, 2026 at 2:00 PM EDT by Late Signer",
    );
  });

  it("takes the latest of several booked log rows by time, in both spellings, with its own manager", () => {
    const earlier = bookedLog({
      changed_by_user_uuid: "user-7",
      changed_at: "2026-11-03T10:00:00.000Z",
    });
    const later = bookedLog({
      changed_by_user_uuid: "user-8",
      changed_at: "2026-11-03 18:00:00+00",
    });

    expect(build({ bookedLogs: [earlier, later] })?.text).toBe(
      "Nov 3, 2026 at 1:00 PM EST by Sam Lee",
    );
    expect(build({ bookedLogs: [later, earlier] })?.text).toBe(
      "Nov 3, 2026 at 1:00 PM EST by Sam Lee",
    );
  });

  it("prefers a row with a readable time to one without when it picks the latest", () => {
    const unreadable = signature({ signer_name: "No Time", signed_at: "not a time" });
    const readable = signature({ signer_name: "Has Time" });

    expect(build({ signatures: [unreadable, readable] })?.text).toContain("by Has Time");
    expect(build({ signatures: [readable, unreadable] })?.text).toContain("by Has Time");
  });

  it("leaves 'by' out when the signer's name is missing or blank", () => {
    for (const signer_name of [null, "", "   "]) {
      expect(build({ signatures: [signature({ signer_name })] })).toEqual({
        label: "Signed",
        text: "Oct 22, 2026 at 3:14 PM EDT",
      });
    }
  });

  it("trims the signer's name as it was typed", () => {
    expect(build({ signatures: [signature({ signer_name: "  Dana Whitfield  " })] })?.text).toBe(
      "Oct 22, 2026 at 3:14 PM EDT by Dana Whitfield",
    );
  });

  it("leaves 'by' out for a manager the Users table does not know, and for no manager at all", () => {
    expect(build({ bookedLogs: [bookedLog({ changed_by_user_uuid: "user-gone" })] })).toEqual({
      label: "Booked",
      text: "Nov 3, 2026 at 9:15 AM EST",
    });
    expect(build({ bookedLogs: [bookedLog({ changed_by_user_uuid: null })] })).toEqual({
      label: "Booked",
      text: "Nov 3, 2026 at 9:15 AM EST",
    });
  });

  it("falls back to booked_at, with no 'by', when no log row exists", () => {
    expect(build({ bookedAt: "2026-08-01T12:00:00+00:00" })).toEqual({
      label: "Booked",
      text: "Aug 1, 2026 at 8:00 AM EDT",
    });
  });

  it("uses the log row, not booked_at, when both exist, and does not mix their times and names", () => {
    expect(build({ bookedLogs: [bookedLog()], bookedAt: "2026-08-01T12:00:00+00:00" })).toEqual({
      label: "Booked",
      text: "Nov 3, 2026 at 9:15 AM EST by Max Gavryshkiv",
    });
  });

  it("has no line when a booked event has no log row and no time at all", () => {
    expect(build({ bookedAt: null })).toBeNull();
    expect(build({ bookedAt: "" })).toBeNull();
    expect(build({ bookedAt: "not a time" })).toBeNull();
  });

  it("writes the time in the zone it is given", () => {
    expect(build({ signatures: [signature()], timezone: "UTC" })?.text).toBe(
      "Oct 22, 2026 at 7:14 PM UTC by Dana Whitfield",
    );
  });

  it("does not change the rows it was given", () => {
    const signatures = [signature({ signed_at: "2026-10-22T10:00:00.000Z" }), signature()];
    const copy = structuredClone(signatures);
    build({ signatures });
    expect(signatures).toEqual(copy);
  });
});
