import { describe, it, expect } from "vitest";
import type {
  EventLineTotalRow,
  ReceivableInstallmentRow,
  ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import { buildCollectionsRows, type CollectionsTaskSource } from "./collectionsRows";

const TODAY = "2026-11-15";

function task(id: string, overrides: Partial<CollectionsTaskSource> = {}): CollectionsTaskSource {
  return {
    task_id: `task-${id}`,
    created_at: "2026-11-01T05:20:00.000Z",
    due_date: "2026-11-15",
    note: "Remind the customer about payment",
    event_uuid: `evt-${id}`,
    event_name: `Event ${id}`,
    event_start: "2027-06-01",
    booked_at: "2026-09-01T12:00:00+00:00",
    tax_percent: null,
    tax_amount_cents: null,
    sales_office_uuid: null,
    ...overrides,
  };
}

const lineTotal = (id: string, cents: number): EventLineTotalRow => ({
  event_uuid: `evt-${id}`,
  line_total_cents: cents,
});

const installment = (
  id: string,
  n: number,
  dueDate: string,
  bps: number,
): ReceivableInstallmentRow => ({
  id: `inst-${id}-${n}`,
  event_uuid: `evt-${id}`,
  due_date: dueDate,
  percentage_bps: bps,
});

let paymentSeq = 0;
const payment = (
  id: string,
  amountCents: number,
  overrides: Partial<ReceivablePaymentRow> = {},
): ReceivablePaymentRow => ({
  id: `pay-${++paymentSeq}`,
  event_uuid: `evt-${id}`,
  installment_id: null,
  amount_cents: amountCents,
  currency: "USD",
  status: "succeeded",
  paid_at: null,
  created_at: "2026-10-01T00:00:00+00:00",
  deleted_at: null,
  ...overrides,
});

const usd = () => "USD" as Currency;

function build(
  tasks: CollectionsTaskSource[],
  rest: {
    lineTotals?: EventLineTotalRow[];
    installments?: ReceivableInstallmentRow[];
    payments?: ReceivablePaymentRow[];
  } = {},
  currencyOf: (source: CollectionsTaskSource) => Currency = usd,
) {
  return buildCollectionsRows(
    {
      tasks,
      lineTotals: rest.lineTotals ?? [],
      installments: rest.installments ?? [],
      payments: rest.payments ?? [],
    },
    TODAY,
    currencyOf,
  );
}

describe("buildCollectionsRows: an event with a payment schedule", () => {
  it("shows the unpaid part of the installment that is due, and the days since it fell due", () => {
    const rows = build([task("a")], {
      lineTotals: [lineTotal("a", 100000)],
      installments: [installment("a", 1, "2026-11-05", 10000)],
    });

    expect(rows).toEqual([
      {
        eventId: "evt-a",
        eventName: "Event a",
        taskId: "task-a",
        dueDate: "2026-11-15",
        note: "Remind the customer about payment",
        amountDueCents: 100000,
        currency: "USD",
        daysOverdue: 10,
      },
    ]);
  });

  it("takes a part payment off the amount and keeps the start of the count", () => {
    const [row] = build([task("a")], {
      lineTotals: [lineTotal("a", 100000)],
      installments: [installment("a", 1, "2026-11-05", 10000)],
      payments: [payment("a", 40000)],
    });

    expect(row.amountDueCents).toBe(60000);
    expect(row.daysOverdue).toBe(10);
  });

  it("adds the tax the event carries to the total", () => {
    const [row] = build([task("a", { tax_percent: 10 })], {
      lineTotals: [lineTotal("a", 100000)],
      installments: [installment("a", 1, "2026-11-05", 10000)],
    });

    expect(row.amountDueCents).toBe(110000);
  });

  it("does not count an installment that is not due yet", () => {
    const [row] = build([task("a")], {
      lineTotals: [lineTotal("a", 100000)],
      installments: [
        installment("a", 1, "2026-11-05", 5000),
        installment("a", 2, "2026-12-05", 5000),
      ],
    });

    expect(row.amountDueCents).toBe(50000);
    expect(row.daysOverdue).toBe(10);
  });
});

describe("buildCollectionsRows: an event with no payment schedule", () => {
  it("owes everything from 7 days before the start; the days count from there", () => {
    // Starts 2026-11-20: due 2026-11-13, so 2 days overdue on the 15th. Booked long before.
    const [row] = build([task("a", { event_start: "2026-11-20" })], {
      lineTotals: [lineTotal("a", 50000)],
    });

    expect(row.amountDueCents).toBe(50000);
    expect(row.daysOverdue).toBe(2);
  });

  it("counts from the booking day when the event was booked inside the 7 days", () => {
    const [row] = build(
      [task("a", { event_start: "2026-11-20", booked_at: "2026-11-14T12:00:00+00:00" })],
      { lineTotals: [lineTotal("a", 50000)] },
    );

    expect(row.amountDueCents).toBe(50000);
    expect(row.daysOverdue).toBe(1);
  });

  it("owes nothing yet when the start is more than 7 days away, but the row stays", () => {
    const [row] = build([task("a", { event_start: "2026-11-23" })], {
      lineTotals: [lineTotal("a", 50000)],
    });

    expect(row.amountDueCents).toBe(0);
    expect(row.daysOverdue).toBeNull();
  });
});

describe("buildCollectionsRows: money and currency", () => {
  it("prices a CAD event in CAD and counts its CAD payments only", () => {
    const [row] = build(
      [task("a", { sales_office_uuid: "office-ca" })],
      {
        lineTotals: [lineTotal("a", 100000)],
        installments: [installment("a", 1, "2026-11-05", 10000)],
        payments: [
          payment("a", 30000, { currency: "CAD" }),
          payment("a", 99999, { currency: "USD" }),
        ],
      },
      (source) => (source.sales_office_uuid === "office-ca" ? "CAD" : "USD"),
    );

    expect(row.currency).toBe("CAD");
    expect(row.amountDueCents).toBe(70000);
  });

  it("keeps a fully paid event in the list with 0 and no days figure", () => {
    const [row] = build([task("a")], {
      lineTotals: [lineTotal("a", 100000)],
      installments: [installment("a", 1, "2026-11-05", 10000)],
      payments: [payment("a", 100000)],
    });

    expect(row.amountDueCents).toBe(0);
    expect(row.daysOverdue).toBeNull();
    expect(row.taskId).toBe("task-a");
  });

  it("treats an event with no line items as a total of 0", () => {
    const [row] = build([task("a", { event_start: "2026-11-20" })]);

    expect(row.amountDueCents).toBe(0);
    expect(row.daysOverdue).toBeNull();
  });

  it("keeps each event's money apart", () => {
    const rows = build([task("a"), task("b")], {
      lineTotals: [lineTotal("a", 100000), lineTotal("b", 25000)],
      installments: [
        installment("a", 1, "2026-11-05", 10000),
        installment("b", 1, "2026-11-10", 10000),
      ],
      payments: [payment("a", 100000)],
    });

    const byId = Object.fromEntries(rows.map((r) => [r.eventId, r]));
    expect(byId["evt-a"].amountDueCents).toBe(0);
    expect(byId["evt-b"].amountDueCents).toBe(25000);
    expect(byId["evt-b"].daysOverdue).toBe(5);
  });
});

describe("buildCollectionsRows: names, dates and duplicates", () => {
  it("shows a dash for an event with no name", () => {
    const rows = build([task("a", { event_name: null }), task("b", { event_name: "  " })]);

    expect(rows.map((r) => r.eventName)).toEqual(["—", "—"]);
  });

  it("reads the day of a timestamp-shaped due date", () => {
    const [row] = build([task("a", { due_date: "2026-11-15T00:00:00.000Z" })]);

    expect(row.dueDate).toBe("2026-11-15");
  });

  it("gives one row per event: with two open tasks, the one created last", () => {
    const rows = build([
      task("a", { task_id: "old", created_at: "2026-11-01T05:20:00.000Z", note: "old" }),
      task("a", { task_id: "new", created_at: "2026-11-09T10:00:00.000Z", note: "new" }),
      task("a", { task_id: "mid", created_at: "2026-11-05T10:00:00.000Z", note: "mid" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].taskId).toBe("new");
    expect(rows[0].note).toBe("new");
  });

  it("returns nothing for no tasks", () => {
    expect(build([])).toEqual([]);
  });
});
