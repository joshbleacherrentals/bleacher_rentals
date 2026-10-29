import { describe, it, expect } from "vitest";
import type { QuotesBookingsEvent } from "@/features/quotesAndBookings/types";
import {
  withReceivableBalances,
  type ReceivableInstallmentRow,
  type ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import { computeCollectionsBalances, type CollectionsBalancesInput } from "./collectionsBalances";

const TODAY = "2026-11-15";
const EVENT_ID = "e0000000-0000-4000-8000-000000000001";

function installment(n: number, dueDate: string, bps: number): ReceivableInstallmentRow {
  return {
    id: `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    event_uuid: EVENT_ID,
    due_date: dueDate,
    percentage_bps: bps,
  };
}

let paymentSeq = 0;
function payment(
  amountCents: number,
  overrides: Partial<ReceivablePaymentRow> = {},
): ReceivablePaymentRow {
  paymentSeq += 1;
  return {
    id: `b0000000-0000-4000-8000-${String(paymentSeq).padStart(12, "0")}`,
    event_uuid: EVENT_ID,
    installment_id: null,
    amount_cents: amountCents,
    currency: "USD",
    status: "succeeded",
    paid_at: null,
    created_at: "2026-01-01T00:00:00+00:00",
    deleted_at: null,
    ...overrides,
  };
}

function input(overrides: Partial<CollectionsBalancesInput> = {}): CollectionsBalancesInput {
  return {
    event: {
      event_start: "2027-06-01",
      booked_at: "2026-09-01T12:00:00+00:00",
      tax_percent: null,
      tax_amount_cents: null,
    },
    lineTotalCents: 3000,
    installments: [],
    payments: [],
    currency: "USD",
    today: TODAY,
    ...overrides,
  };
}

/** Three installments of 1000 on Oct 1, Nov 1 and Dec 1 (3333 / 3333 / 3334 bps on 3000). */
const THREE = [
  installment(1, "2026-10-01", 3333),
  installment(2, "2026-11-01", 3333),
  installment(3, "2026-12-01", 3334),
];

describe("computeCollectionsBalances: a payment schedule", () => {
  const scenarios: { name: string; payments: ReceivablePaymentRow[]; today: string }[] = [
    { name: "nothing paid", payments: [], today: TODAY },
    {
      name: "the worked example (first and third prepaid)",
      payments: [
        payment(1000, { installment_id: THREE[0].id }),
        payment(1000, { installment_id: THREE[2].id }),
      ],
      today: TODAY,
    },
    { name: "untargeted money", payments: [payment(1500)], today: TODAY },
    {
      name: "a refund after full payment",
      payments: [payment(3000), payment(-500)],
      today: "2026-12-15",
    },
    {
      name: "a pending and a CAD payment that must not count",
      payments: [
        payment(900),
        payment(5000, { status: "pending" }),
        payment(5000, { currency: "CAD" }),
      ],
      today: TODAY,
    },
  ];

  it.each(scenarios)(
    "gives the same Amount Due and remaining as withReceivableBalances: $name",
    ({ payments, today }) => {
      const twin = computeCollectionsBalances(input({ installments: THREE, payments, today }));
      const [ar] = withReceivableBalances(
        [
          {
            id: EVENT_ID,
            tax_amount_cents: null,
            tax_percent: null,
          } as unknown as QuotesBookingsEvent,
        ],
        {
          lineTotals: [{ event_uuid: EVENT_ID, line_total_cents: 3000 }],
          installments: THREE,
          payments,
        },
        () => "USD",
        today,
      );
      expect(twin.amountDueCents).toBe(ar.amount_due_cents);
      expect(twin.remainingCents).toBe(ar.remaining_balance_cents);
    },
  );

  it("reports the total, what was received and the allocation", () => {
    const result = computeCollectionsBalances(
      input({
        installments: THREE,
        payments: [
          payment(1000, { installment_id: THREE[0].id }),
          payment(1000, { installment_id: THREE[2].id }),
        ],
      }),
    );
    expect(result).toMatchObject({
      totalCents: 3000,
      receivedCents: 2000,
      remainingCents: 1000,
      amountDueCents: 1000,
    });
    expect(result.allocation.installments.map((i) => i.allocatedCents)).toEqual([1000, 0, 1000]);
  });

  it("adds the tax: a saved amount wins over the percent, which is rounded", () => {
    const byPercent = computeCollectionsBalances(
      input({
        event: {
          event_start: "2027-06-01",
          booked_at: null,
          tax_percent: 5,
          tax_amount_cents: null,
        },
        lineTotalCents: 1050,
      }),
    );
    expect(byPercent.totalCents).toBe(1103); // 52.5 rounds up
    const byAmount = computeCollectionsBalances(
      input({
        event: {
          event_start: "2027-06-01",
          booked_at: null,
          tax_percent: 13,
          tax_amount_cents: 100,
        },
        lineTotalCents: 1000,
      }),
    );
    expect(byAmount.totalCents).toBe(1100);
  });

  it("clamps a negative total to 0 and owes nothing", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2020-01-01",
          booked_at: null,
          tax_percent: 13,
          tax_amount_cents: null,
        },
        lineTotalCents: -500,
      }),
    );
    expect(result).toMatchObject({ totalCents: 0, remainingCents: 0, amountDueCents: 0 });
  });

  it("lets received go negative, as allocatePayments does", () => {
    const result = computeCollectionsBalances(input({ payments: [payment(-200)] }));
    expect(result.receivedCents).toBe(-200);
    expect(result.remainingCents).toBe(3200);
  });
});

describe("computeCollectionsBalances: no payment schedule", () => {
  const withStart = (event_start: string | null, booked_at: string | null = null) =>
    input({ event: { event_start, booked_at, tax_percent: null, tax_amount_cents: null } });

  it("owes the whole remaining balance when the start is 7 days away", () => {
    expect(computeCollectionsBalances(withStart("2026-11-22")).amountDueCents).toBe(3000);
  });

  it("owes nothing when the start is 8 days away", () => {
    expect(computeCollectionsBalances(withStart("2026-11-23")).amountDueCents).toBe(0);
  });

  it("owes the whole remaining balance for an event booked inside the 7 days", () => {
    expect(computeCollectionsBalances(withStart("2026-11-18")).amountDueCents).toBe(3000);
  });

  it("owes the whole remaining balance for an event that already started", () => {
    expect(computeCollectionsBalances(withStart("2026-10-16")).amountDueCents).toBe(3000);
  });

  it("owes only what is left after a part payment, and 0 while not yet due", () => {
    const due = computeCollectionsBalances({
      ...withStart("2026-11-18"),
      payments: [payment(600)],
    });
    expect(due.amountDueCents).toBe(2400);
    const early = computeCollectionsBalances({
      ...withStart("2026-11-23"),
      payments: [payment(600)],
    });
    expect(early).toMatchObject({ remainingCents: 2400, amountDueCents: 0 });
  });

  it("takes the 7 days from the date part of a timestamp-shaped start", () => {
    expect(computeCollectionsBalances(withStart("2026-11-22T00:00:00")).amountDueCents).toBe(3000);
    expect(computeCollectionsBalances(withStart("2026-11-23T00:00:00")).amountDueCents).toBe(0);
  });

  it("owes nothing when there is no start date, like the SQL (a null date never compares true)", () => {
    expect(computeCollectionsBalances(withStart(null)).amountDueCents).toBe(0);
  });
});

describe("computeCollectionsBalances: overdueSince and daysOverdue", () => {
  it("counts an event booked earlier from 7 days before its start", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2026-11-18",
          booked_at: "2026-10-01T09:00:00+00:00",
          tax_percent: null,
          tax_amount_cents: null,
        },
      }),
    );
    expect(result.overdueSince).toBe("2026-11-11");
    expect(result.daysOverdue).toBe(4);
  });

  it("counts an event booked inside the 7 days from booked_at", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2026-11-18",
          booked_at: "2026-11-13T15:30:00+00:00",
          tax_percent: null,
          tax_amount_cents: null,
        },
      }),
    );
    expect(result.overdueSince).toBe("2026-11-13");
    expect(result.daysOverdue).toBe(2);
  });

  it("reads a booked_at shaped like the PowerSync local DB returns it", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2026-11-18",
          booked_at: "2026-11-13 15:30:00+00",
          tax_percent: null,
          tax_amount_cents: null,
        },
      }),
    );
    expect(result.overdueSince).toBe("2026-11-13");
  });

  it("treats a null booked_at as 7 days before the start", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2026-11-18",
          booked_at: null,
          tax_percent: null,
          tax_amount_cents: null,
        },
      }),
    );
    expect(result.overdueSince).toBe("2026-11-11");
    expect(result.daysOverdue).toBe(4);
  });

  it("gives an empty figure when the count starts in the future", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2026-11-18",
          booked_at: "2026-11-16T10:00:00+00:00",
          tax_percent: null,
          tax_amount_cents: null,
        },
      }),
    );
    expect(result.amountDueCents).toBe(3000);
    expect(result.overdueSince).toBeNull();
    expect(result.daysOverdue).toBeNull();
  });

  it("gives an empty figure when the Amount Due is 0 (no schedule)", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2026-11-18",
          booked_at: null,
          tax_percent: null,
          tax_amount_cents: null,
        },
        payments: [payment(3000)],
      }),
    );
    expect(result.amountDueCents).toBe(0);
    expect(result.overdueSince).toBeNull();
    expect(result.daysOverdue).toBeNull();
  });

  it("gives an empty figure when nothing is due yet (no schedule)", () => {
    const result = computeCollectionsBalances(
      input({
        event: {
          event_start: "2026-12-30",
          booked_at: null,
          tax_percent: null,
          tax_amount_cents: null,
        },
      }),
    );
    expect(result.daysOverdue).toBeNull();
  });

  it("starts at the oldest installment that is not fully paid and already due", () => {
    const result = computeCollectionsBalances(input({ installments: THREE }));
    expect(result.overdueSince).toBe("2026-10-01");
    expect(result.daysOverdue).toBe(45);
  });

  it("keeps the oldest installment as the start after a part payment on it", () => {
    const result = computeCollectionsBalances(
      input({ installments: THREE, payments: [payment(600, { installment_id: THREE[0].id })] }),
    );
    expect(result.overdueSince).toBe("2026-10-01");
  });

  it("moves to the next overdue installment once the oldest is paid in full", () => {
    const result = computeCollectionsBalances(
      input({
        installments: THREE,
        payments: [
          payment(400, { installment_id: THREE[0].id }),
          payment(600, { installment_id: THREE[0].id }),
        ],
      }),
    );
    expect(result.overdueSince).toBe("2026-11-01");
    expect(result.daysOverdue).toBe(14);
  });

  it("ignores an unpaid installment that is not due yet", () => {
    const result = computeCollectionsBalances(
      input({
        installments: THREE,
        payments: [payment(2000)],
      }),
    );
    expect(result.amountDueCents).toBe(0);
    expect(result.overdueSince).toBeNull();
    expect(result.daysOverdue).toBeNull();
  });

  it("counts an installment due today as 0 days overdue", () => {
    const result = computeCollectionsBalances(
      input({ lineTotalCents: 1000, installments: [installment(1, TODAY, 10000)] }),
    );
    expect(result.amountDueCents).toBe(1000);
    expect(result.overdueSince).toBe(TODAY);
    expect(result.daysOverdue).toBe(0);
  });

  it("does not let a payment aimed at a later installment hide an overdue one", () => {
    const result = computeCollectionsBalances(
      input({
        installments: THREE,
        payments: [
          payment(1000, { installment_id: THREE[0].id }),
          payment(1000, { installment_id: THREE[2].id }),
        ],
      }),
    );
    expect(result.amountDueCents).toBe(1000);
    expect(result.overdueSince).toBe("2026-11-01");
  });
});
