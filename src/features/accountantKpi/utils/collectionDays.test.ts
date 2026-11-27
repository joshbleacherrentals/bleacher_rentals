import { describe, expect, it } from "vitest";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import type { ReceivablePaymentRow } from "@/features/quotesAndBookings/utils/accountsReceivable";
import {
  collectedPayments,
  torontoDay,
  type CollectionSources,
  type FirstSignatureRow,
  type KpiEventRow,
  type KpiInstallmentRow,
} from "./collectionDays";

// docs/specs/accountant-kpi.md §1 (C2-C7, D1, D5, D6, D9, D10, D17) and §4. The rows are the ones
// the local database returns: timestamps as `YYYY-MM-DD HH:MM:SS+00`, booleans as 0 / 1.

const usd = (): Currency => "USD";

function event(id = "E", overrides: Partial<KpiEventRow> = {}): KpiEventRow {
  return {
    id,
    sales_office_uuid: null,
    tax_percent: null,
    tax_amount_cents: null,
    booked_at: null,
    ...overrides,
  };
}

function inst(
  eventId: string,
  id: string,
  dueDate: string | null,
  percentageBps: number,
  dueOnSigning = 0,
): KpiInstallmentRow {
  return {
    id,
    event_uuid: eventId,
    due_date: dueDate,
    percentage_bps: percentageBps,
    due_on_signing: dueOnSigning,
  };
}

/** A payment made at noon Toronto time on the given day (17:00 UTC in winter). */
const at = (day: string) => `${day} 17:00:00+00`;

function pay(
  eventId: string,
  id: string,
  amountCents: number,
  paidAt: string | null,
  overrides: Partial<ReceivablePaymentRow> = {},
): ReceivablePaymentRow {
  return {
    id,
    event_uuid: eventId,
    installment_id: null,
    amount_cents: amountCents,
    currency: "USD",
    status: "succeeded",
    paid_at: paidAt,
    created_at: paidAt,
    deleted_at: null,
    ...overrides,
  };
}

function sources(overrides: Partial<CollectionSources> = {}): CollectionSources {
  return {
    events: [event()],
    lineTotals: [{ event_uuid: "E", line_total_cents: 200000 }],
    installments: [],
    payments: [],
    firstSignatures: [],
    ...overrides,
  };
}

const rowsOf = (s: CollectionSources, currencyOf: (e: KpiEventRow) => Currency = usd) =>
  collectedPayments(s, currencyOf);
const role = (rows: ReturnType<typeof rowsOf>, r: "deposit" | "final") =>
  rows.filter((row) => row.role === r);

describe("E1: a two-row schedule, both rows paid in full", () => {
  const s = sources({
    installments: [inst("E", "I1", "2026-11-02", 5000, 1), inst("E", "I2", "2026-11-20", 5000)],
    payments: [
      pay("E", "P1", 100000, at("2026-11-04"), { installment_id: "I1" }),
      pay("E", "P2", 100000, at("2026-11-25"), { installment_id: "I2" }),
    ],
  });

  it("Deposit is the first row, 2 days", () => {
    expect(role(rowsOf(s), "deposit")).toEqual([
      {
        eventId: "E",
        paymentId: "I1",
        role: "deposit",
        dueDate: "2026-11-02",
        collectedDay: "2026-11-04",
        days: 2,
      },
    ]);
  });

  it("Final Payment is the last row, 5 days", () => {
    expect(role(rowsOf(s), "final")).toEqual([
      {
        eventId: "E",
        paymentId: "I2",
        role: "final",
        dueDate: "2026-11-20",
        collectedDay: "2026-11-25",
        days: 5,
      },
    ]);
  });
});

describe("C2, C4: which row is first and which is last", () => {
  it("the due-on-signing row is the Deposit even when its date is later than the others", () => {
    const s = sources({
      installments: [inst("E", "Y", "2026-11-30", 5000), inst("E", "X", "2026-12-15", 5000, 1)],
      payments: [
        pay("E", "P1", 100000, at("2026-12-20"), { installment_id: "X" }),
        pay("E", "P2", 100000, at("2026-12-01"), { installment_id: "Y" }),
      ],
    });
    const rows = rowsOf(s);
    expect(role(rows, "deposit").map((r) => r.paymentId)).toEqual(["X"]);
    expect(role(rows, "final").map((r) => r.paymentId)).toEqual(["Y"]);
  });

  it("with three rows only the first and the last count; the middle one counts nowhere", () => {
    const s = sources({
      lineTotals: [{ event_uuid: "E", line_total_cents: 300000 }],
      installments: [
        inst("E", "I1", "2026-11-01", 3334, 1),
        inst("E", "I2", "2026-11-10", 3333),
        inst("E", "I3", "2026-11-20", 3333),
      ],
      payments: [pay("E", "P", 300000, at("2026-11-21"))],
    });
    const rows = rowsOf(s);
    expect(rows.map((r) => [r.role, r.paymentId])).toEqual([
      ["deposit", "I1"],
      ["final", "I3"],
    ]);
  });

  it("rows without the mark are ordered by date, then id", () => {
    const s = sources({
      installments: [inst("E", "B", "2026-11-20", 5000), inst("E", "A", "2026-11-02", 5000)],
      payments: [pay("E", "P", 200000, at("2026-11-25"))],
    });
    const rows = rowsOf(s);
    expect(role(rows, "deposit").map((r) => r.paymentId)).toEqual(["A"]);
    expect(role(rows, "final").map((r) => r.paymentId)).toEqual(["B"]);
  });
});

describe("D1, C5: the money adds up", () => {
  const oneRow = (payments: ReceivablePaymentRow[]) =>
    sources({
      lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
      installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
      payments,
    });

  it("E2: 600 on Nov 5 and 400 on Nov 9 for 1000 due Nov 1 is collected Nov 9, 8 days", () => {
    const rows = rowsOf(
      oneRow([pay("E", "P1", 60000, at("2026-11-05")), pay("E", "P2", 40000, at("2026-11-09"))]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "final", collectedDay: "2026-11-09", days: 8 });
  });

  it("with only the 600 the row is not collected", () => {
    expect(rowsOf(oneRow([pay("E", "P1", 60000, at("2026-11-05"))]))).toEqual([]);
  });

  it("no payments: nothing is collected", () => {
    expect(rowsOf(oneRow([]))).toEqual([]);
  });

  it("a payment bigger than the row still collects it, on the payment's day", () => {
    const rows = rowsOf(oneRow([pay("E", "P1", 150000, at("2026-11-05"))]));
    expect(rows[0]).toMatchObject({ collectedDay: "2026-11-05", days: 4 });
  });

  it("a deleted payment, a payment that is not succeeded and a foreign-currency one do not count", () => {
    const rows = rowsOf(
      oneRow([
        pay("E", "P1", 100000, at("2026-11-02"), { deleted_at: "2026-11-03 00:00:00+00" }),
        pay("E", "P2", 100000, at("2026-11-02"), { status: "failed" }),
        pay("E", "P3", 100000, at("2026-11-02"), { currency: "CAD" }),
      ]),
    );
    expect(rows).toEqual([]);
  });

  it("uses the event's currency to decide which payments count", () => {
    const cad = () => "CAD" as Currency;
    const s = oneRow([pay("E", "P1", 100000, at("2026-11-02"), { currency: "CAD" })]);
    expect(rowsOf(s, cad)).toHaveLength(1);
    expect(rowsOf(s, usd)).toEqual([]);
  });

  it("the event total includes tax, so the net amount alone does not collect the row", () => {
    const s = sources({
      events: [event("E", { tax_amount_cents: 10000 })],
      lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
      installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
      payments: [pay("E", "P1", 100000, at("2026-11-02"))],
    });
    expect(rowsOf(s)).toEqual([]);
    s.payments = [...s.payments, pay("E", "P2", 10000, at("2026-11-03"))];
    expect(rowsOf(s)[0]).toMatchObject({ collectedDay: "2026-11-03", days: 2 });
  });
});

describe("C6: the collected day is the day the row became full for the last time", () => {
  const twoRows = (payments: ReceivablePaymentRow[]) =>
    sources({
      installments: [inst("E", "A", "2026-11-01", 5000, 1), inst("E", "B", "2026-12-01", 5000)],
      payments,
    });

  it("E3: a payment aimed at A on Nov 10 and one with no installment on Nov 5 give Nov 10", () => {
    const rows = rowsOf(
      twoRows([
        pay("E", "P1", 40000, at("2026-11-10"), { installment_id: "A" }),
        pay("E", "P2", 60000, at("2026-11-05")),
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "deposit", collectedDay: "2026-11-10", days: 9 });
  });

  it("a surplus that spills into the next row does not move the first row's day", () => {
    const rows = rowsOf(
      twoRows([pay("E", "P1", 150000, at("2026-11-05")), pay("E", "P2", 50000, at("2026-11-20"))]),
    );
    expect(rows.map((r) => [r.role, r.collectedDay])).toEqual([
      ["deposit", "2026-11-05"],
      ["final", "2026-11-20"],
    ]);
  });

  it("a payment that only goes to the next row is not the day of this one", () => {
    const rows = rowsOf(
      twoRows([pay("E", "P1", 100000, at("2026-11-05")), pay("E", "P2", 50000, at("2026-11-20"))]),
    );
    expect(rows.map((r) => [r.role, r.collectedDay])).toEqual([["deposit", "2026-11-05"]]);
  });

  it("a refund reopens the row: it is not collected", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [
          pay("E", "P1", 100000, at("2026-11-05")),
          pay("E", "R1", -40000, at("2026-11-07")),
        ],
      }),
    );
    expect(rows).toEqual([]);
  });

  it("a refund and then a new payment: the day of the new payment, never of the refund", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [
          pay("E", "P1", 100000, at("2026-11-05")),
          pay("E", "R1", -40000, at("2026-11-07")),
          pay("E", "P3", 40000, at("2026-11-10")),
        ],
      }),
    );
    expect(rows[0]).toMatchObject({ collectedDay: "2026-11-10", days: 9 });
  });

  it("E10: a refund that takes the row below full and a new payment that fills it again, all aimed at the row", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [
          pay("E", "P1", 100000, at("2026-11-05"), { installment_id: "I1" }),
          pay("E", "R1", -40000, at("2026-11-07"), { installment_id: "I1" }),
          pay("E", "P3", 40000, at("2026-11-10"), { installment_id: "I1" }),
        ],
      }),
    );
    expect(rows[0]).toMatchObject({ collectedDay: "2026-11-10", days: 9 });
  });

  it("a row that was full, reopened and not filled again is not collected, and the other row still is", () => {
    const rows = rowsOf(
      twoRows([
        pay("E", "P1", 100000, at("2026-11-05"), { installment_id: "A" }),
        pay("E", "P2", 100000, at("2026-11-06"), { installment_id: "B" }),
        pay("E", "R1", -30000, at("2026-11-07"), { installment_id: "A" }),
      ]),
    );
    expect(rows.map((r) => [r.role, r.paymentId])).toEqual([["final", "B"]]);
  });

  it("payments entered out of order are replayed by the day they arrived", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [
          pay("E", "P2", 40000, at("2026-11-09")),
          pay("E", "P1", 60000, at("2026-11-05")),
        ],
      }),
    );
    expect(rows[0]).toMatchObject({ collectedDay: "2026-11-09", days: 8 });
  });

  it("uses created_at when paid_at is empty", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [pay("E", "P1", 100000, null, { created_at: at("2026-11-04") })],
      }),
    );
    expect(rows[0]).toMatchObject({ collectedDay: "2026-11-04", days: 3 });
  });

  it("a paid_at that cannot be read falls back to created_at; with neither, the row is skipped", () => {
    const base = {
      lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
      installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
    };
    const fallback = rowsOf(
      sources({
        ...base,
        payments: [pay("E", "P1", 100000, "not a date", { created_at: at("2026-11-04") })],
      }),
    );
    expect(fallback[0]).toMatchObject({ collectedDay: "2026-11-04" });
    const none = rowsOf(
      sources({
        ...base,
        payments: [pay("E", "P1", 100000, "not a date", { created_at: "also not a date" })],
      }),
    );
    expect(none).toEqual([]);
  });
});

describe("D17, E9: the day is the Toronto day", () => {
  it("2026-11-10T03:00:00Z is Nov 9 in Toronto, in both timestamp shapes", () => {
    expect(torontoDay("2026-11-10T03:00:00.000Z")).toBe("2026-11-09");
    expect(torontoDay("2026-11-10 03:00:00+00")).toBe("2026-11-09");
  });

  it("an unreadable or empty value has no day", () => {
    expect(torontoDay(null)).toBeNull();
    expect(torontoDay("")).toBeNull();
    expect(torontoDay("nonsense")).toBeNull();
  });

  it("a payment at 22:00 Toronto on Nov 9 is on Nov 9, so the days are counted from Nov 9", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [pay("E", "P1", 100000, "2026-11-10 03:00:00+00")],
      }),
    );
    expect(rows[0]).toMatchObject({ collectedDay: "2026-11-09", days: 8 });
  });
});

describe("C8 is not applied here: an early payment is returned with negative days", () => {
  it("E4: due Nov 20, collected Nov 18 is -2; collected Nov 20 is 0", () => {
    const early = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-20", 10000)],
        payments: [pay("E", "P1", 100000, at("2026-11-18"))],
      }),
    );
    expect(early[0].days).toBe(-2);
    const onTime = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-20", 10000)],
        payments: [pay("E", "P1", 100000, at("2026-11-20"))],
      }),
    );
    expect(onTime[0].days).toBe(0);
  });
});

describe("D6: a schedule of one row goes to Final Payment only", () => {
  it("E6: due Nov 1, collected Nov 3 is Final Payment, 2 days, and no Deposit", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [pay("E", "P1", 100000, at("2026-11-03"))],
      }),
    );
    expect(rows).toEqual([
      {
        eventId: "E",
        paymentId: "I1",
        role: "final",
        dueDate: "2026-11-01",
        collectedDay: "2026-11-03",
        days: 2,
      },
    ]);
  });
});

describe("D5, D9, D10, C3: an event with no schedule", () => {
  const noSchedule = (over: Partial<CollectionSources>) =>
    sources({
      events: [event("E")],
      lineTotals: [{ event_uuid: "E", line_total_cents: 100000 }],
      payments: [pay("E", "P1", 100000, at("2026-11-12"))],
      ...over,
    });
  const signed = (signedAt: string | null): FirstSignatureRow[] => [
    { event_uuid: "E", first_signed_at: signedAt },
  ];

  it("E5: first signature on Nov 2, paid in full Nov 12: Final Payment, 10 days", () => {
    const rows = rowsOf(noSchedule({ firstSignatures: signed("2026-11-02 15:00:00+00") }));
    expect(rows).toEqual([
      {
        eventId: "E",
        paymentId: "none:E",
        role: "final",
        dueDate: "2026-11-02",
        collectedDay: "2026-11-12",
        days: 10,
      },
    ]);
  });

  it("with no signature the day is the Toronto day of booked_at", () => {
    const rows = rowsOf(
      noSchedule({ events: [event("E", { booked_at: "2026-11-04 15:00:00+00" })] }),
    );
    expect(rows[0]).toMatchObject({ dueDate: "2026-11-04", days: 8 });
  });

  it("the signature wins over booked_at", () => {
    const rows = rowsOf(
      noSchedule({
        events: [event("E", { booked_at: "2026-11-04 15:00:00+00" })],
        firstSignatures: signed("2026-11-03 15:00:00+00"),
      }),
    );
    expect(rows[0]).toMatchObject({ dueDate: "2026-11-03" });
  });

  it("the signature's day is the Toronto day: 02:00 UTC on Nov 3 is Nov 2", () => {
    const rows = rowsOf(noSchedule({ firstSignatures: signed("2026-11-03 02:00:00+00") }));
    expect(rows[0]).toMatchObject({ dueDate: "2026-11-02" });
  });

  it("D10: with neither a signature nor booked_at the event is skipped", () => {
    expect(rowsOf(noSchedule({}))).toEqual([]);
    expect(rowsOf(noSchedule({ firstSignatures: signed(null) }))).toEqual([]);
  });

  it("an unpaid event with no schedule gives nothing", () => {
    expect(
      rowsOf(noSchedule({ firstSignatures: signed("2026-11-02 15:00:00+00"), payments: [] })),
    ).toEqual([]);
  });

  it("the whole total is due: half of it does not collect the row", () => {
    const rows = rowsOf(
      noSchedule({
        firstSignatures: signed("2026-11-02 15:00:00+00"),
        payments: [pay("E", "P1", 50000, at("2026-11-12"))],
      }),
    );
    expect(rows).toEqual([]);
  });
});

describe("C7 and the edge cases of §4", () => {
  it("a row with no due date is skipped; the other row still counts", () => {
    const rows = rowsOf(
      sources({
        installments: [inst("E", "I1", null, 5000, 1), inst("E", "I2", "2026-11-20", 5000)],
        payments: [pay("E", "P1", 200000, at("2026-11-25"))],
      }),
    );
    expect(rows.map((r) => [r.role, r.paymentId])).toEqual([["final", "I2"]]);
  });

  it("an event total of 0 collects nothing", () => {
    const rows = rowsOf(
      sources({
        lineTotals: [],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [pay("E", "P1", 100000, at("2026-11-03"))],
      }),
    );
    expect(rows).toEqual([]);
  });

  it("each event is worked out on its own: another event's payments do not fill this one", () => {
    const rows = rowsOf(
      sources({
        events: [event("E"), event("F")],
        lineTotals: [
          { event_uuid: "E", line_total_cents: 100000 },
          { event_uuid: "F", line_total_cents: 100000 },
        ],
        installments: [
          inst("E", "IE", "2026-11-01", 10000, 1),
          inst("F", "IF", "2026-11-01", 10000, 1),
        ],
        payments: [pay("F", "P1", 100000, at("2026-11-03"))],
      }),
    );
    expect(rows.map((r) => [r.eventId, r.paymentId])).toEqual([["F", "IF"]]);
  });

  it("an event that is not in the list gives nothing, whatever its payments", () => {
    const rows = rowsOf(
      sources({
        events: [],
        installments: [inst("E", "I1", "2026-11-01", 10000, 1)],
        payments: [pay("E", "P1", 200000, at("2026-11-03"))],
      }),
    );
    expect(rows).toEqual([]);
  });

  it("does not change the arrays it is given", () => {
    const s = sources({
      installments: [inst("E", "B", "2026-11-20", 5000), inst("E", "A", "2026-11-02", 5000)],
      payments: [pay("E", "P", 200000, at("2026-11-25"))],
    });
    const before = JSON.stringify(s);
    rowsOf(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});
