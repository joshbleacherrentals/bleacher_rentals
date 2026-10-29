import { describe, it, expect } from "vitest";
import { computeCollectionsBalances } from "./collectionsBalances";
import { invoiceStatus } from "./invoiceStatus";

// Spec: docs/specs/accountant-collections-08-invoice-data.md §1 (the five statuses) and §4.

const TODAY = "2026-11-15";

type Input = Parameters<typeof computeCollectionsBalances>[0];

const balances = ({
  event,
  ...overrides
}: Partial<Omit<Input, "event">> & { event?: Partial<Input["event"]> } = {}) =>
  computeCollectionsBalances({
    event: {
      event_start: "2027-06-01",
      booked_at: "2026-09-01T12:00:00+00:00",
      tax_percent: null,
      tax_amount_cents: null,
      ...event,
    },
    lineTotalCents: 100000,
    installments: [],
    payments: [],
    currency: "USD",
    today: TODAY,
    ...overrides,
  });

function installment(n: number, dueDate: string, bps: number) {
  return { id: `i-${n}`, event_uuid: "e-1", due_date: dueDate, percentage_bps: bps };
}

function paid(amountCents: number) {
  return {
    id: `p-${amountCents}`,
    event_uuid: "e-1",
    installment_id: null,
    amount_cents: amountCents,
    currency: "USD",
    status: "succeeded",
    paid_at: "2026-09-01T12:00:00+00:00",
    created_at: "2026-09-01T12:00:00+00:00",
    deleted_at: null,
  };
}

/** The status a booked-or-not event gets from the twin's own figures. */
function statusOf(eventStatus: string | null, b: ReturnType<typeof balances>) {
  return invoiceStatus({
    eventStatus,
    remainingCents: b.remainingCents,
    amountDueCents: b.amountDueCents,
  });
}

describe("invoiceStatus: the five outcomes", () => {
  it("is Paid for a booked event with nothing left to pay", () => {
    expect(invoiceStatus({ eventStatus: "booked", remainingCents: 0, amountDueCents: 0 })).toBe(
      "paid",
    );
  });

  it("is Schedule for a booked event with a balance and nothing overdue", () => {
    expect(invoiceStatus({ eventStatus: "booked", remainingCents: 5000, amountDueCents: 0 })).toBe(
      "schedule",
    );
  });

  it("is Collections for a booked event with an overdue amount", () => {
    expect(
      invoiceStatus({ eventStatus: "booked", remainingCents: 5000, amountDueCents: 2000 }),
    ).toBe("collections");
  });

  it("is Cancelled for a lost event, whatever it still owes", () => {
    expect(invoiceStatus({ eventStatus: "lost", remainingCents: 5000, amountDueCents: 2000 })).toBe(
      "cancelled",
    );
    expect(invoiceStatus({ eventStatus: "lost", remainingCents: 0, amountDueCents: 0 })).toBe(
      "cancelled",
    );
  });

  it.each(["quoted", "draft", "unsigned_changes", null])(
    "is Not active yet for status %s",
    (eventStatus) => {
      expect(invoiceStatus({ eventStatus, remainingCents: 5000, amountDueCents: 2000 })).toBe(
        "not_active",
      );
    },
  );
});

describe("invoiceStatus: the order of the rules", () => {
  it("looks at Lost before anything else", () => {
    expect(invoiceStatus({ eventStatus: "lost", remainingCents: 0, amountDueCents: 0 })).toBe(
      "cancelled",
    );
  });

  it("looks at 'not booked' before the money: a paid quote is still Not active yet", () => {
    expect(invoiceStatus({ eventStatus: "quoted", remainingCents: 0, amountDueCents: 0 })).toBe(
      "not_active",
    );
  });

  it("calls a booked event whose total is 0 Paid", () => {
    const b = balances({ lineTotalCents: 0 });
    expect(b.totalCents).toBe(0);
    expect(statusOf("booked", b)).toBe("paid");
  });
});

describe("invoiceStatus: from the twin's figures", () => {
  it("is Collections when an installment due today is unpaid", () => {
    const b = balances({
      installments: [installment(1, TODAY, 5000), installment(2, "2026-12-15", 5000)],
    });
    expect(b.amountDueCents).toBe(50000);
    expect(statusOf("booked", b)).toBe("collections");
  });

  it("is Schedule when the next installment is tomorrow and nothing is overdue", () => {
    const b = balances({ installments: [installment(1, "2026-11-16", 10000)] });
    expect(b.amountDueCents).toBe(0);
    expect(statusOf("booked", b)).toBe("schedule");
  });

  it("is Schedule when the event is part-paid and on time", () => {
    const b = balances({
      installments: [installment(1, "2026-10-01", 5000), installment(2, "2026-12-01", 5000)],
      payments: [paid(50000)],
    });
    expect(b.amountDueCents).toBe(0);
    expect(b.remainingCents).toBe(50000);
    expect(statusOf("booked", b)).toBe("schedule");
  });

  it("is Schedule for an event with no schedule that starts in 8 days", () => {
    const b = balances({ event: { event_start: "2026-11-23" } });
    expect(b.amountDueCents).toBe(0);
    expect(statusOf("booked", b)).toBe("schedule");
  });

  it("is Collections for an event with no schedule that starts in 7 days", () => {
    const b = balances({ event: { event_start: "2026-11-22" } });
    expect(b.amountDueCents).toBe(100000);
    expect(statusOf("booked", b)).toBe("collections");
  });

  it("is Paid once the whole total has been received", () => {
    const b = balances({
      installments: [installment(1, "2026-10-01", 10000)],
      payments: [paid(100000)],
    });
    expect(statusOf("booked", b)).toBe("paid");
  });
});
