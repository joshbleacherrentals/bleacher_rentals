import { describe, it, expect } from "vitest";
import type {
  EventLineTotalRow,
  ReceivableInstallmentRow,
  ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import { DEFAULT_LIST_STATE, type CollectionsListState } from "./collectionsListState";
import {
  buildCollectionsRows,
  type CollectionsRow,
  type CollectionsTaskSource,
} from "./collectionsRows";
import { amountTypeOf, filterCollectionsRows, sortCollectionsRows } from "./collectionsSort";

const TODAY = "2026-11-15";

// By default a row owes all it still has to pay (Amount Due equals Remaining): a Collections row.
function row(id: string, overrides: Partial<CollectionsRow> = {}): CollectionsRow {
  const amountDueCents = overrides.amountDueCents ?? 10000;
  return {
    eventId: id,
    eventName: `Event ${id}`,
    taskId: `task-${id}`,
    dueDate: "2026-11-10",
    note: "Remind the customer about payment",
    amountDueCents,
    remainingCents: amountDueCents,
    currency: "USD",
    daysOverdue: 10,
    ...overrides,
  };
}

const state = (
  sort: CollectionsListState["sort"],
  dir: CollectionsListState["dir"],
  showNotDue = false,
  type: CollectionsListState["type"] = "collections",
): CollectionsListState => ({ sort, dir, showNotDue, type });

const ids = (rows: CollectionsRow[]) => rows.map((r) => r.eventId);
const DEFAULT = state("followUp", "asc");

describe("sortCollectionsRows: the default order (Next Follow Up, oldest first)", () => {
  it("puts the oldest task first", () => {
    const rows = [
      row("a", { dueDate: "2026-11-12" }),
      row("b", { dueDate: "2026-11-01" }),
      row("c", { dueDate: "2026-11-05" }),
    ];
    expect(ids(sortCollectionsRows(rows, DEFAULT))).toEqual(["b", "c", "a"]);
  });

  it("breaks a tie on the date by the larger amount, then more days, then the id", () => {
    const rows = [
      row("d", { amountDueCents: 500, daysOverdue: 99 }),
      row("c", { amountDueCents: 900, daysOverdue: 5 }),
      row("b", { amountDueCents: 900, daysOverdue: 40 }),
      row("a", { amountDueCents: 900, daysOverdue: 40 }),
    ];
    expect(ids(sortCollectionsRows(rows, DEFAULT))).toEqual(["a", "b", "c", "d"]);
  });

  it("does not touch the array it is given", () => {
    const rows = [row("b", { dueDate: "2026-11-12" }), row("a", { dueDate: "2026-11-01" })];
    const before = [...rows];
    sortCollectionsRows(rows, DEFAULT);
    expect(rows).toEqual(before);
  });
});

describe("sortCollectionsRows: Next Follow Up, latest first", () => {
  it("reverses the date and keeps the tie chain (amount largest, days most, id)", () => {
    const rows = [
      row("a", { dueDate: "2026-11-01", amountDueCents: 100 }),
      row("b", { dueDate: "2026-11-12", amountDueCents: 100 }),
      row("c", { dueDate: "2026-11-12", amountDueCents: 900 }),
    ];
    expect(ids(sortCollectionsRows(rows, state("followUp", "desc")))).toEqual(["c", "b", "a"]);
  });
});

describe("sortCollectionsRows: Amount Overdue", () => {
  const rows = [
    row("small", { amountDueCents: 1000 }),
    row("big", { amountDueCents: 90000 }),
    row("mid", { amountDueCents: 20000 }),
  ];

  it("from the largest, each next row is smaller", () => {
    const sorted = sortCollectionsRows(rows, state("amount", "desc"));
    expect(ids(sorted)).toEqual(["big", "mid", "small"]);
  });

  it("from the smallest, each next row is larger", () => {
    const sorted = sortCollectionsRows(rows, state("amount", "asc"));
    expect(ids(sorted)).toEqual(["small", "mid", "big"]);
  });

  it("breaks a tie by Payment Overdue (most days), then Next Follow Up (oldest), then the id", () => {
    const tied = [
      row("e", { daysOverdue: 5, dueDate: "2026-11-01" }),
      row("d", { daysOverdue: 30, dueDate: "2026-11-09" }),
      row("c", { daysOverdue: 30, dueDate: "2026-11-02" }),
      row("b", { daysOverdue: 30, dueDate: "2026-11-02" }),
    ];
    for (const dir of ["asc", "desc"] as const) {
      expect(ids(sortCollectionsRows(tied, state("amount", dir)))).toEqual(["b", "c", "d", "e"]);
    }
  });
});

describe("sortCollectionsRows: Payment Overdue", () => {
  const rows = [
    row("few", { daysOverdue: 3 }),
    row("many", { daysOverdue: 80 }),
    row("some", { daysOverdue: 20 }),
  ];

  it("most days first, and fewest days first", () => {
    expect(ids(sortCollectionsRows(rows, state("overdue", "desc")))).toEqual([
      "many",
      "some",
      "few",
    ]);
    expect(ids(sortCollectionsRows(rows, state("overdue", "asc")))).toEqual([
      "few",
      "some",
      "many",
    ]);
  });

  it("breaks a tie by Amount Overdue (largest), then Next Follow Up (oldest), then the id", () => {
    const tied = [
      row("e", { amountDueCents: 100, dueDate: "2026-11-01" }),
      row("d", { amountDueCents: 700, dueDate: "2026-11-09" }),
      row("c", { amountDueCents: 700, dueDate: "2026-11-02" }),
      row("b", { amountDueCents: 700, dueDate: "2026-11-02" }),
    ];
    for (const dir of ["asc", "desc"] as const) {
      expect(ids(sortCollectionsRows(tied, state("overdue", dir)))).toEqual(["b", "c", "d", "e"]);
    }
  });
});

describe("sortCollectionsRows: a row with no days figure", () => {
  it("counts as 0 days", () => {
    const rows = [
      row("none", { daysOverdue: null }),
      row("zero", { daysOverdue: 0 }),
      row("one", { daysOverdue: 1 }),
    ];
    // "none" and "zero" tie on days, then on everything else: the id decides.
    expect(ids(sortCollectionsRows(rows, state("overdue", "desc")))).toEqual([
      "one",
      "none",
      "zero",
    ]);
    expect(ids(sortCollectionsRows(rows, state("overdue", "asc")))).toEqual([
      "none",
      "zero",
      "one",
    ]);
  });

  it("does not break the default order's tie chain", () => {
    const rows = [row("b", { daysOverdue: null }), row("a", { daysOverdue: 0 })];
    expect(ids(sortCollectionsRows(rows, DEFAULT))).toEqual(["a", "b"]);
  });
});

describe("sortCollectionsRows: the order is total", () => {
  const rows = [
    row("a", { dueDate: "2026-11-01", amountDueCents: 500, daysOverdue: 4 }),
    row("b", { dueDate: "2026-11-01", amountDueCents: 500, daysOverdue: 4 }),
    row("c", { dueDate: "2026-11-01", amountDueCents: 500, daysOverdue: null }),
    row("d", { dueDate: "2026-11-02", amountDueCents: 500, daysOverdue: 4 }),
    row("e", { dueDate: "2026-11-02", amountDueCents: 0, daysOverdue: null }),
    row("f", { dueDate: "2026-12-30", amountDueCents: 9000, daysOverdue: 400 }),
  ];

  function shuffled<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let s = seed;
    for (let i = out.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      const j = s % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  it.each([
    ["Next Follow Up, oldest", state("followUp", "asc")],
    ["Next Follow Up, latest", state("followUp", "desc")],
    ["Payment Overdue, most", state("overdue", "desc")],
    ["Payment Overdue, fewest", state("overdue", "asc")],
    ["Amount Overdue, largest", state("amount", "desc")],
    ["Amount Overdue, smallest", state("amount", "asc")],
  ])("gives the same output for any input order: %s", (_name, listState) => {
    const expected = ids(sortCollectionsRows(rows, listState));
    for (let seed = 1; seed <= 25; seed++) {
      expect(ids(sortCollectionsRows(shuffled(rows, seed), listState))).toEqual(expected);
    }
  });
});

describe("filterCollectionsRows", () => {
  const rows = [
    row("past", { dueDate: "2026-11-01" }),
    row("today", { dueDate: TODAY }),
    row("tomorrow", { dueDate: "2026-11-16" }),
    row("later", { dueDate: "2027-02-01" }),
  ];

  it("drops the tasks dated after today while Show Not Due Yet is off", () => {
    expect(ids(filterCollectionsRows(rows, state("followUp", "asc", false), TODAY))).toEqual([
      "past",
      "today",
    ]);
  });

  it("keeps every task when Show Not Due Yet is on", () => {
    expect(ids(filterCollectionsRows(rows, state("followUp", "asc", true), TODAY))).toEqual([
      "past",
      "today",
      "tomorrow",
      "later",
    ]);
  });

  it("keeps a task due today and drops one due tomorrow", () => {
    const kept = ids(filterCollectionsRows(rows, DEFAULT, TODAY));
    expect(kept).toContain("today");
    expect(kept).not.toContain("tomorrow");
  });
});

// docs/specs/accountant-collections-23-amount-type-switch.md §1 and §5: the type of a row.
describe("amountTypeOf: the rule on plain figures", () => {
  const of = (amountDueCents: number, remainingCents: number) =>
    amountTypeOf(row("x", { amountDueCents, remainingCents }));

  it("is Collections when Amount Due equals Remaining", () => {
    expect(of(60000, 60000)).toBe("collections");
  });

  it("is Collections when Amount Due is above Remaining too (the calculation caps it, so this is a guard)", () => {
    expect(of(70000, 60000)).toBe("collections");
  });

  it("is Deposits when Amount Due is above 0 and below Remaining", () => {
    expect(of(30000, 60000)).toBe("deposits");
    expect(of(1, 2)).toBe("deposits");
    expect(of(59999, 60000)).toBe("deposits");
  });

  it("is in no type when Amount Due is 0, whatever Remaining is", () => {
    expect(of(0, 60000)).toBeNull();
  });

  it("is in no type when Amount Due and Remaining are both 0", () => {
    expect(of(0, 0)).toBeNull();
  });
});

// The user's events of spec 23 §1, built through the real figures (`buildCollectionsRows`), with
// today = TODAY (2026-11-15) and a $1,000.00 quote.
describe("amountTypeOf: the user's events in the page's figures", () => {
  const TOTAL = 100000;
  const day = (offset: number) => {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  function typeOf(config: {
    startInDays?: number;
    /** `[dueInDays, percentageBps]` per installment, in order; none means no payment schedule. */
    schedule?: [number, number][];
    payments?: { cents: number; toInstallment?: number }[];
  }) {
    const task: CollectionsTaskSource = {
      task_id: "task-x",
      created_at: "2026-11-01T05:20:00.000Z",
      due_date: TODAY,
      note: "",
      event_uuid: "evt-x",
      event_name: "Event x",
      event_start: day(config.startInDays ?? 60),
      booked_at: "2026-09-01T12:00:00+00:00",
      tax_percent: null,
      tax_amount_cents: null,
      sales_office_uuid: null,
    };
    const lineTotals: EventLineTotalRow[] = [{ event_uuid: "evt-x", line_total_cents: TOTAL }];
    const installments: ReceivableInstallmentRow[] = (config.schedule ?? []).map(
      ([dueInDays, bps], i) => ({
        id: `inst-${i + 1}`,
        event_uuid: "evt-x",
        due_date: day(dueInDays),
        percentage_bps: bps,
      }),
    );
    const payments: ReceivablePaymentRow[] = (config.payments ?? []).map((p, i) => ({
      id: `pay-${i + 1}`,
      event_uuid: "evt-x",
      installment_id: p.toInstallment ? `inst-${p.toInstallment}` : null,
      amount_cents: p.cents,
      currency: "USD",
      status: "succeeded",
      paid_at: null,
      created_at: `2026-10-0${i + 1}T00:00:00+00:00`,
      deleted_at: null,
    }));
    const [built] = buildCollectionsRows(
      { tasks: [task], lineTotals, installments, payments },
      TODAY,
      () => "USD",
    );
    return { type: amountTypeOf(built), row: built };
  }

  // A schedule of three: 40% + 30% + 30% of $1,000.00.
  const THREE = (second: number, third: number): [number, number][] => [
    [-30, 4000],
    [second, 3000],
    [third, 3000],
  ];

  it("Collections A: a schedule of three, the first paid, the second overdue a week, the third due today", () => {
    const { type, row: r } = typeOf({
      schedule: THREE(-7, 0),
      payments: [{ cents: 40000 }],
    });
    expect(r.amountDueCents).toBe(60000);
    expect(r.remainingCents).toBe(60000);
    expect(type).toBe("collections");
  });

  it("Collections B: no schedule, the event starts today, the whole amount unpaid", () => {
    const { type, row: r } = typeOf({ startInDays: 0 });
    expect(r.amountDueCents).toBe(TOTAL);
    expect(r.remainingCents).toBe(TOTAL);
    expect(type).toBe("collections");
  });

  it("Collections C: no schedule, the event starts in five days: in no type", () => {
    const { type, row: r } = typeOf({ startInDays: 5 });
    expect(r.amountDueCents).toBe(0);
    expect(r.remainingCents).toBe(TOTAL);
    expect(type).toBeNull();
  });

  it("Collections D / Deposits A: the first paid, the second overdue a week, the third in a week: Deposits", () => {
    const { type, row: r } = typeOf({
      schedule: THREE(-7, 7),
      payments: [{ cents: 40000 }],
    });
    expect(r.amountDueCents).toBe(30000);
    expect(r.remainingCents).toBe(60000);
    expect(type).toBe("deposits");
  });

  it("Collections E: a schedule of one payment, overdue today, the event starts in five days", () => {
    const { type, row: r } = typeOf({ schedule: [[0, 10000]], startInDays: 5 });
    expect(r.amountDueCents).toBe(TOTAL);
    expect(r.remainingCents).toBe(TOTAL);
    expect(type).toBe("collections");
  });

  it("Deposits B: a schedule of three and all three overdue: Collections, not Deposits", () => {
    const { type } = typeOf({
      schedule: [
        [-30, 4000],
        [-14, 3000],
        [-7, 3000],
      ],
    });
    expect(type).toBe("collections");
  });

  it("Deposits C: no schedule, not paid in full, starts in 14 days: in no type", () => {
    expect(typeOf({ startInDays: 14 }).type).toBeNull();
  });

  it("Deposits D: no schedule, not paid in full, starts in 7 days: in no type", () => {
    expect(typeOf({ startInDays: 7 }).type).toBeNull();
  });

  it("a part of the first payment paid and all three overdue: Collections (D1)", () => {
    const { type, row: r } = typeOf({
      schedule: [
        [-30, 4000],
        [-14, 3000],
        [-7, 3000],
      ],
      payments: [{ cents: 10000 }],
    });
    expect(r.amountDueCents).toBe(90000);
    expect(r.remainingCents).toBe(90000);
    expect(type).toBe("collections");
  });

  it("the first paid in full and the other two overdue: Collections (D1)", () => {
    const { type } = typeOf({
      schedule: [
        [-30, 4000],
        [-14, 3000],
        [-7, 3000],
      ],
      payments: [{ cents: 40000 }],
    });
    expect(type).toBe("collections");
  });

  it("one payment not yet due, the rest overdue: Deposits", () => {
    const { type } = typeOf({
      schedule: [
        [-30, 4000],
        [-14, 3000],
        [10, 3000],
      ],
    });
    expect(type).toBe("deposits");
  });

  it("a payment made ahead on a later installment, leaving only overdue money: Collections", () => {
    const { type, row: r } = typeOf({
      schedule: [
        [-30, 4000],
        [-7, 3000],
        [30, 3000],
      ],
      payments: [{ cents: 30000, toInstallment: 3 }],
    });
    expect(r.amountDueCents).toBe(70000);
    expect(r.remainingCents).toBe(70000);
    expect(type).toBe("collections");
  });

  it("a schedule that totals less than 100%, every payment overdue: Deposits", () => {
    const { type, row: r } = typeOf({
      schedule: [
        [-30, 3000],
        [-14, 3000],
      ],
    });
    expect(r.amountDueCents).toBe(60000);
    expect(r.remainingCents).toBe(TOTAL);
    expect(type).toBe("deposits");
  });

  it("a schedule that totals more than 100%, every payment overdue: Collections", () => {
    const { type, row: r } = typeOf({
      schedule: [
        [-30, 6000],
        [-14, 6000],
      ],
    });
    expect(r.amountDueCents).toBe(TOTAL);
    expect(r.remainingCents).toBe(TOTAL);
    expect(type).toBe("collections");
  });

  it("an event paid in full whose task is still open: Amount Due and Remaining 0, in no type", () => {
    const { type, row: r } = typeOf({
      schedule: [[-30, 10000]],
      payments: [{ cents: TOTAL }],
    });
    expect(r.amountDueCents).toBe(0);
    expect(r.remainingCents).toBe(0);
    expect(type).toBeNull();
  });

  it("an open task whose payments are all ahead: Amount Due 0, in no type", () => {
    const { type, row: r } = typeOf({ schedule: [[10, 10000]] });
    expect(r.amountDueCents).toBe(0);
    expect(r.remainingCents).toBe(TOTAL);
    expect(type).toBeNull();
  });
});

describe("filterCollectionsRows: the amount type", () => {
  // Past, today and a future follow-up date, for each kind of figures.
  const rows = [
    row("col-past", { dueDate: "2026-11-01", amountDueCents: 500, remainingCents: 500 }),
    row("col-future", { dueDate: "2026-11-20", amountDueCents: 700, remainingCents: 700 }),
    row("dep-today", { dueDate: TODAY, amountDueCents: 300, remainingCents: 900 }),
    row("dep-future", { dueDate: "2026-12-01", amountDueCents: 100, remainingCents: 400 }),
    row("zero-past", { dueDate: "2026-11-02", amountDueCents: 0, remainingCents: 900 }),
    row("zero-future", { dueDate: "2026-11-25", amountDueCents: 0, remainingCents: 0 }),
  ];
  const listed = (type: CollectionsListState["type"], showNotDue: boolean) =>
    ids(filterCollectionsRows(rows, state("followUp", "asc", showNotDue, type), TODAY));

  it("Collections keeps only the Collections rows", () => {
    expect(listed("collections", false)).toEqual(["col-past"]);
    expect(listed("collections", true)).toEqual(["col-past", "col-future"]);
  });

  it("Deposits keeps only the Deposits rows", () => {
    expect(listed("deposits", false)).toEqual(["dep-today"]);
    expect(listed("deposits", true)).toEqual(["dep-today", "dep-future"]);
  });

  it("All keeps every row, a row with Amount Due 0 included", () => {
    expect(listed("all", false)).toEqual(["col-past", "dep-today", "zero-past"]);
    expect(listed("all", true)).toEqual([
      "col-past",
      "col-future",
      "dep-today",
      "dep-future",
      "zero-past",
      "zero-future",
    ]);
  });

  it("never lists a row under both Collections and Deposits", () => {
    for (const showNotDue of [false, true]) {
      const collections = listed("collections", showNotDue);
      const deposits = listed("deposits", showNotDue);
      expect(collections.filter((id) => deposits.includes(id))).toEqual([]);
    }
  });

  it("lists a Collections row and a Deposits row together under All", () => {
    const all = listed("all", true);
    for (const id of [...listed("collections", true), ...listed("deposits", true)]) {
      expect(all).toContain(id);
    }
  });

  it("keeps the order of the rows it is given", () => {
    const reversed = [...rows].reverse();
    expect(
      ids(filterCollectionsRows(reversed, state("followUp", "asc", true, "all"), TODAY)),
    ).toEqual(ids(reversed));
  });

  it("does not touch the array it is given", () => {
    const before = [...rows];
    filterCollectionsRows(rows, state("followUp", "asc", true, "deposits"), TODAY);
    expect(rows).toEqual(before);
  });

  it("the default state lists the Collections rows due today or earlier", () => {
    expect(ids(filterCollectionsRows(rows, DEFAULT_LIST_STATE, TODAY))).toEqual(["col-past"]);
  });
});
