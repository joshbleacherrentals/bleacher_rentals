import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import { resolveOfficeCurrency } from "@/features/quotesAndBookings/utils/resolveOfficeCurrency";
import { addDays } from "./calendarDays";
import {
  computeCollectionsBalances,
  type CollectionsBalances,
  type CollectionsBalancesInput,
} from "./collectionsBalances";

/**
 * The shared cases of the Amount Due calculation (docs/specs/accountant-collections-03).
 *
 * One list, two readers. `amountDueParity.test.ts` runs every case through the TypeScript twin;
 * `amountDueParitySql.ts` turns the same list into `supabase/tests/ar_amount_due_parity.test.sql`,
 * which runs it through `ar_event_balances`. A change to one side without the other turns CI red.
 *
 * The hand cases carry `expected` numbers worked out by hand from the rules, never read back from
 * the code, so a bug copied into both sides is still caught. The fuzz cases take theirs from the
 * twin: the TypeScript is the reference, and a fuzz failure in SQL means the SQL is wrong.
 */

/** An office as the currency rule sees it: its QuickBooks currency and its address province. */
export type CaseOffice = { qboCurrency: string | null; province: string | null };

export type CaseLineItem = { cents: number; quantity: number | null; deleted?: boolean };

export type CaseInstallment = { dueDate: string; percentageBps: number };

export type CasePayment = {
  /** Signed: a refund is a negative amount. Never 0 (the table forbids it). */
  amountCents: number;
  currency: string;
  status: string;
  /** A soft-deleted payment. It is never aimed at an installment (the table forbids it). */
  deleted?: boolean;
  /** An index into `installments`, `"other-event"` for an installment of another event, or none. */
  installment?: number | "other-event" | null;
};

export type AmountDueCase = {
  name: string;
  /** No office means no currency to look up: USD. */
  office: CaseOffice | null;
  event: {
    event_start: string; // YYYY-MM-DD (the column is NOT NULL)
    booked_at: string | null;
    tax_percent: number | null;
    tax_amount_cents: number | null;
  };
  lineItems: CaseLineItem[];
  installments: CaseInstallment[];
  payments: CasePayment[];
  today: string; // YYYY-MM-DD
  expected: { total: number; received: number; remaining: number; amountDue: number };
};

// ── Ids ─────────────────────────────────────────────────────────────────────

export type CaseIdKind =
  | "event"
  | "installment"
  | "line"
  | "payment"
  | "otherEvent"
  | "otherInstallment";

const KIND_DIGIT: Record<CaseIdKind, string> = {
  event: "1",
  installment: "2",
  line: "3",
  payment: "4",
  otherEvent: "5",
  otherInstallment: "6",
};

/**
 * A uuid derived from the case's position in the list. Within one case the ids of one kind sort
 * in the order of `n`, in JavaScript (as strings) and in Postgres (as uuids), so the tie break by
 * id is the same on both sides.
 */
export function caseId(kind: CaseIdKind, caseIndex: number, n = 1): string {
  const head = `${KIND_DIGIT[kind]}${caseIndex.toString(16).padStart(7, "0")}`;
  return `${head}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

// ── Running a case through the twin ─────────────────────────────────────────

export function caseCurrency(c: AmountDueCase): Currency {
  return c.office ? resolveOfficeCurrency(c.office.qboCurrency, c.office.province) : "USD";
}

export function toTwinInput(c: AmountDueCase, caseIndex = 0): CollectionsBalancesInput {
  const eventId = caseId("event", caseIndex);
  const installments = c.installments.map((i, n) => ({
    id: caseId("installment", caseIndex, n + 1),
    event_uuid: eventId,
    due_date: i.dueDate,
    percentage_bps: i.percentageBps,
  }));
  return {
    event: c.event,
    lineTotalCents: c.lineItems
      .filter((l) => !l.deleted)
      .reduce((sum, l) => sum + (l.quantity ?? 1) * l.cents, 0),
    installments,
    payments: c.payments.map((p, n) => ({
      id: caseId("payment", caseIndex, n + 1),
      event_uuid: eventId,
      installment_id:
        p.installment === null || p.installment === undefined
          ? null
          : p.installment === "other-event"
            ? caseId("otherInstallment", caseIndex)
            : installments[p.installment].id,
      amount_cents: p.amountCents,
      currency: p.currency,
      status: p.status,
      paid_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
      deleted_at: p.deleted ? "2026-06-01T00:00:00+00:00" : null,
    })),
    currency: caseCurrency(c),
    today: c.today,
  };
}

export function runTwin(c: AmountDueCase, caseIndex = 0): CollectionsBalances {
  return computeCollectionsBalances(toTwinInput(c, caseIndex));
}

// ── Hand cases ──────────────────────────────────────────────────────────────

const TODAY = "2026-11-15";

type HandSpec = {
  office?: CaseOffice | null;
  start?: string;
  bookedAt?: string | null;
  taxPercent?: number | null;
  taxCents?: number | null;
  lines?: CaseLineItem[];
  installments?: CaseInstallment[];
  payments?: CasePayment[];
  today?: string;
  /** [total, received, remaining, amount due], in cents. */
  expect: [number, number, number, number];
};

function hand(name: string, spec: HandSpec): AmountDueCase {
  const [total, received, remaining, amountDue] = spec.expect;
  return {
    name,
    office: spec.office ?? null,
    event: {
      event_start: spec.start ?? "2027-06-01",
      booked_at: spec.bookedAt ?? null,
      tax_percent: spec.taxPercent ?? null,
      tax_amount_cents: spec.taxCents ?? null,
    },
    lineItems: spec.lines ?? [],
    installments: spec.installments ?? [],
    payments: spec.payments ?? [],
    today: spec.today ?? TODAY,
    expected: { total, received, remaining, amountDue },
  };
}

const line = (cents: number, quantity: number | null = 1, deleted = false): CaseLineItem => ({
  cents,
  quantity,
  deleted,
});
const inst = (dueDate: string, percentageBps: number): CaseInstallment => ({
  dueDate,
  percentageBps,
});
const pay = (amountCents: number, rest: Partial<CasePayment> = {}): CasePayment => ({
  amountCents,
  currency: "USD",
  status: "succeeded",
  deleted: false,
  installment: null,
  ...rest,
});

/** 3000 in three installments of 1000, due Oct 1, Nov 1 and Dec 1 2026 (3333 / 3333 / 3334 bps). */
const THREE = [inst("2026-10-01", 3333), inst("2026-11-01", 3333), inst("2026-12-01", 3334)];
const three = (spec: Omit<HandSpec, "lines" | "installments">): HandSpec => ({
  ...spec,
  lines: [line(3000)],
  installments: THREE,
});

export const HAND_CASES: AmountDueCase[] = [
  // ── The total (nothing is due: no schedule, the event starts far away) ──
  // 2 x 1000 + a null quantity (counts as 1) x 500 = 2500, the deleted line ignored, 13% tax = 325.
  hand("total: deleted lines ignored, null quantity counts as 1, 13% tax", {
    lines: [line(1000, 2), line(500, null), line(9999, 1, true)],
    taxPercent: 13,
    expect: [2825, 0, 2825, 0],
  }),
  // 1050 at 5% = 52.5 -> 53.
  hand("total: a tax of 52.5 rounds up to 53", {
    lines: [line(1050)],
    taxPercent: 5,
    expect: [1103, 0, 1103, 0],
  }),
  // 2000 * (9.975 / 100) = 199.49999999999997 -> 199; 2000 * 9.975 / 100 would be 199.5 -> 200.
  hand("total: the tax is lineTotal * (percent / 100) in double precision", {
    lines: [line(2000)],
    taxPercent: 9.975,
    expect: [2199, 0, 2199, 0],
  }),
  hand("total: a tax override wins over the percent", {
    lines: [line(1000)],
    taxPercent: 13,
    taxCents: 100,
    expect: [1100, 0, 1100, 0],
  }),
  hand("total: discounts bigger than the items give 0", {
    lines: [line(1000), line(-1500)],
    taxPercent: 13,
    expect: [0, 0, 0, 0],
  }),
  hand("total: no percent and no override means no tax", {
    lines: [line(700)],
    expect: [700, 0, 700, 0],
  }),

  // ── The schedule ──
  // 10001 at 3333 / 3333 / 3334 bps: 3333.33 / 3333.33 / 3334.33; the extra cent goes to the third.
  ...[
    ["Oct 1", "2026-10-01", 3333],
    ["Nov 1", "2026-11-01", 6666],
    ["Dec 1", "2026-12-01", 10001],
  ].map(([label, today, due]) =>
    hand(`schedule: 10001 in thirds, the extra cent lands on the third (due by ${label})`, {
      lines: [line(10001)],
      installments: THREE,
      today: today as string,
      expect: [10001, 0, 10001, due as number],
    }),
  ),
  // 10001 at 5000 / 5000: a tie at .5; the earlier due date takes the extra cent, though the later
  // installment is listed first.
  hand("schedule: a tie goes to the earlier due date (due by Oct 1)", {
    lines: [line(10001)],
    installments: [inst("2026-11-01", 5000), inst("2026-10-01", 5000)],
    today: "2026-10-01",
    expect: [10001, 0, 10001, 5001],
  }),
  hand("schedule: ...and the second is 5000 (due by Nov 1)", {
    lines: [line(10001)],
    installments: [inst("2026-11-01", 5000), inst("2026-10-01", 5000)],
    today: "2026-11-01",
    expect: [10001, 0, 10001, 10001],
  }),
  // 3333 + 3333 = 6666 is not 10000: each amount is rounded on its own.
  hand("schedule: percentages that do not add to 10000 round each amount", {
    lines: [line(10001)],
    installments: [inst("2026-10-01", 3333), inst("2026-11-01", 3333)],
    today: "2026-11-01",
    expect: [10001, 0, 10001, 6666],
  }),
  // 1001 at 5000 / 2000 (7000): 500.5 -> 501, 200.2 -> 200.
  hand("schedule: an unbalanced 500.5 rounds up to 501", {
    lines: [line(1001)],
    installments: [inst("2026-10-01", 5000), inst("2026-11-01", 2000)],
    today: "2026-10-01",
    expect: [1001, 0, 1001, 501],
  }),
  hand("schedule: ...and 200.2 rounds to 200", {
    lines: [line(1001)],
    installments: [inst("2026-10-01", 5000), inst("2026-11-01", 2000)],
    today: "2026-11-01",
    expect: [1001, 0, 1001, 701],
  }),
  // A cent split of 100: 33.33 / 33.33 / 33.34 -> floors 33 + 33 + 33, the extra cent to .34 (third).
  hand("cent split: 100 in thirds, the third gets the extra cent (due by Nov 1)", {
    lines: [line(100)],
    installments: THREE,
    today: "2026-11-01",
    expect: [100, 0, 100, 66],
  }),
  hand("cent split: ...and all three are 100 (due by Dec 1)", {
    lines: [line(100)],
    installments: THREE,
    today: "2026-12-01",
    expect: [100, 0, 100, 100],
  }),
  // 3334 / 3333 / 3333: 33.34 / 33.33 / 33.33 -> the extra cent goes to the first, 34 / 33 / 33.
  hand("cent split: 100 with the big share first, the first gets the extra cent (due by Oct 1)", {
    lines: [line(100)],
    installments: [inst("2026-10-01", 3334), inst("2026-11-01", 3333), inst("2026-12-01", 3333)],
    today: "2026-10-01",
    expect: [100, 0, 100, 34],
  }),
  hand("cent split: ...and 67 after the second (due by Nov 1)", {
    lines: [line(100)],
    installments: [inst("2026-10-01", 3334), inst("2026-11-01", 3333), inst("2026-12-01", 3333)],
    today: "2026-11-01",
    expect: [100, 0, 100, 67],
  }),
  // 1002 at 2500 / 2500 / 5000: 250.5 / 250.5 / 501. The first two tie at .5; the earlier due date
  // (Oct 1, listed last) takes the extra cent: Oct 251, Nov 250, Dec 501.
  hand("cent split: a tie of two among three goes to the earlier due date (due by Oct 1)", {
    lines: [line(1002)],
    installments: [inst("2026-12-01", 5000), inst("2026-11-01", 2500), inst("2026-10-01", 2500)],
    today: "2026-10-01",
    expect: [1002, 0, 1002, 251],
  }),
  hand("cent split: ...Nov is 250 (due by Nov 1)", {
    lines: [line(1002)],
    installments: [inst("2026-12-01", 5000), inst("2026-11-01", 2500), inst("2026-10-01", 2500)],
    today: "2026-11-01",
    expect: [1002, 0, 1002, 501],
  }),

  // ── The allocation (3 x 1000 due Oct 1, Nov 1, Dec 1; today Nov 15) ──
  hand(
    "allocation: nothing paid, two installments are due",
    three({ expect: [3000, 0, 3000, 2000] }),
  ),
  // The worked example: 1000 aimed at the first and the third. "Due minus received" would give 0.
  hand(
    "allocation: the worked example, a prepaid third does not cover the unpaid second",
    three({
      payments: [pay(1000, { installment: 0 }), pay(1000, { installment: 2 })],
      expect: [3000, 2000, 1000, 1000],
    }),
  ),
  hand(
    "allocation: untargeted money fills oldest first",
    three({ payments: [pay(1500)], expect: [3000, 1500, 1500, 500] }),
  ),
  hand(
    "allocation: only the sum of the untargeted payments matters",
    three({ payments: [pay(700), pay(800)], expect: [3000, 1500, 1500, 500] }),
  ),
  hand(
    "allocation: an overpayment on one installment spills forwards",
    three({ payments: [pay(1500, { installment: 0 })], expect: [3000, 1500, 1500, 500] }),
  ),
  hand(
    "allocation: a big overpayment spills over several installments",
    three({ payments: [pay(2500, { installment: 0 })], expect: [3000, 2500, 500, 0] }),
  ),
  hand(
    "allocation: targeted money stays on its installment, the pool tops it up first",
    three({
      payments: [pay(600, { installment: 0 }), pay(1000)],
      expect: [3000, 1600, 1400, 400],
    }),
  ),
  // All three paid, then -1000: the newest (Dec 1) reopens. Not due on Nov 15, due on Dec 15.
  ...[
    ["a refund reopens the newest installment, which is not due yet", TODAY, 0],
    ["...and once it is due, it is what is owed", "2026-12-15", 1000],
  ].map(([label, today, due]) =>
    hand(
      `allocation: ${label}`,
      three({
        payments: [
          pay(1000, { installment: 0 }),
          pay(1000, { installment: 1 }),
          pay(1000, { installment: 2 }),
          pay(-1000),
        ],
        today: today as string,
        expect: [3000, 2000, 1000, due as number],
      }),
    ),
  ),
  hand(
    "allocation: an overpayment past the total leaves nothing due",
    three({ payments: [pay(4000)], today: "2026-12-15", expect: [3000, 4000, 0, 0] }),
  ),
  // The worked example plus three payments of 5000 that must all be ignored.
  hand(
    "allocation: a pending, a CAD and a deleted payment are not counted anywhere",
    three({
      payments: [
        pay(1000, { installment: 0 }),
        pay(1000, { installment: 2 }),
        pay(5000, { status: "pending" }),
        pay(5000, { currency: "CAD" }),
        pay(5000, { deleted: true }),
      ],
      expect: [3000, 2000, 1000, 1000],
    }),
  ),
  hand(
    "allocation: a payment aimed at another event's installment is untargeted here",
    three({
      payments: [pay(1500, { installment: "other-event" })],
      expect: [3000, 1500, 1500, 500],
    }),
  ),
  hand(
    "allocation: a partly paid overdue installment still owes the rest of it",
    three({ payments: [pay(600, { installment: 0 })], expect: [3000, 600, 2400, 1400] }),
  ),
  // 400 and then 600 aimed at the first: it is paid in full; only the second is owed.
  hand(
    "allocation: an overdue installment paid in full by a later payment owes nothing",
    three({
      payments: [pay(400, { installment: 0 }), pay(600, { installment: 0 })],
      expect: [3000, 1000, 2000, 1000],
    }),
  ),
  // 3000 paid, 500 refunded: 2500 fills 1000 + 1000 + 500; the third holds 500 and is 500 short.
  ...[
    ["not due yet", TODAY, 0],
    ["due", "2026-12-15", 500],
  ].map(([label, today, due]) =>
    hand(
      `allocation: a refund after full payment, the reopened third is ${label}`,
      three({
        payments: [pay(3000), pay(-500)],
        today: today as string,
        expect: [3000, 2500, 500, due as number],
      }),
    ),
  ),

  // ── The boundary ──
  hand("boundary: an installment due today is overdue", {
    lines: [line(1000)],
    installments: [inst("2026-11-15", 10000)],
    expect: [1000, 0, 1000, 1000],
  }),
  hand("boundary: an installment due tomorrow is not", {
    lines: [line(1000)],
    installments: [inst("2026-11-16", 10000)],
    expect: [1000, 0, 1000, 0],
  }),

  // ── No payment schedule: the whole balance falls due 7 days before event_start ──
  hand("no schedule: event_start = today + 7 is due today", {
    lines: [line(2000)],
    start: "2026-11-22",
    expect: [2000, 0, 2000, 2000],
  }),
  hand("no schedule: event_start = today + 8 is not due yet", {
    lines: [line(2000)],
    start: "2026-11-23",
    expect: [2000, 0, 2000, 0],
  }),
  hand("no schedule: an event booked inside the 7 days is overdue at once", {
    lines: [line(2000)],
    start: "2026-11-18",
    bookedAt: "2026-11-13T12:00:00+00:00",
    expect: [2000, 0, 2000, 2000],
  }),
  hand("no schedule: a part-paid event owes only what is left", {
    lines: [line(2000)],
    start: "2026-11-18",
    payments: [pay(600)],
    expect: [2000, 600, 1400, 1400],
  }),
  hand("no schedule: an event that already started is overdue", {
    lines: [line(2000)],
    start: "2026-10-16",
    expect: [2000, 0, 2000, 2000],
  }),
  hand("no schedule: not due yet stays 0 even with a balance left", {
    lines: [line(2000)],
    start: "2026-11-23",
    payments: [pay(600)],
    expect: [2000, 600, 1400, 0],
  }),
  hand("no schedule: the date comes from the caller (today + 7 a day later)", {
    lines: [line(2000)],
    start: "2026-11-23",
    today: "2026-11-16",
    expect: [2000, 0, 2000, 2000],
  }),
  hand("no schedule: fully paid owes nothing", {
    lines: [line(2000)],
    start: "2026-10-16",
    payments: [pay(2000)],
    expect: [2000, 2000, 0, 0],
  }),

  // ── The currency rule decides which payments count ──
  hand("currency: Ontario office, no QuickBooks currency: CAD counts (case and spaces ignored)", {
    office: { qboCurrency: null, province: "Ontario" },
    lines: [line(2000)],
    start: "2026-10-16",
    payments: [
      pay(600, { currency: "CAD" }),
      pay(100, { currency: " cad" }),
      pay(700, { currency: "USD" }),
    ],
    expect: [2000, 700, 1300, 1300],
  }),
  hand("currency: QuickBooks CAD wins over a Texas address", {
    office: { qboCurrency: "CAD", province: "Texas" },
    lines: [line(2000)],
    start: "2026-10-16",
    payments: [pay(300, { currency: "CAD" }), pay(500, { currency: "USD" })],
    expect: [2000, 300, 1700, 1700],
  }),
  hand("currency: QuickBooks ' usd ' wins over an Ontario address", {
    office: { qboCurrency: " usd ", province: "Ontario" },
    lines: [line(2000)],
    start: "2026-10-16",
    payments: [pay(500, { currency: "USD" }), pay(300, { currency: "CAD" })],
    expect: [2000, 500, 1500, 1500],
  }),
  hand("currency: no QuickBooks currency and a Texas address is USD", {
    office: { qboCurrency: null, province: "Texas" },
    lines: [line(2000)],
    start: "2026-10-16",
    payments: [pay(100, { currency: "USD" }), pay(100, { currency: "CAD" })],
    expect: [2000, 100, 1900, 1900],
  }),
  hand("currency: a QuickBooks currency that is neither falls back to the province", {
    office: { qboCurrency: "EUR", province: "Ontario" },
    lines: [line(2000)],
    start: "2026-10-16",
    payments: [pay(400, { currency: "CAD" }), pay(400, { currency: "USD" })],
    expect: [2000, 400, 1600, 1600],
  }),
  hand("currency: no office is USD", {
    office: null,
    lines: [line(2000)],
    start: "2026-10-16",
    payments: [pay(400, { currency: "USD" }), pay(400, { currency: "CAD" })],
    expect: [2000, 400, 1600, 1600],
  }),
  hand("currency: a CAD event ignores a USD payment against its installment", {
    office: { qboCurrency: "CAD", province: null },
    lines: [line(2000)],
    installments: [inst("2026-10-01", 10000)],
    payments: [pay(800, { currency: "USD" }), pay(500, { currency: "CAD" })],
    expect: [2000, 500, 1500, 1500],
  }),
  hand("deleted: an event whose only payment is deleted still owes everything", {
    lines: [line(1000)],
    installments: [inst("2026-10-01", 10000)],
    payments: [pay(1000, { deleted: true })],
    expect: [1000, 0, 1000, 1000],
  }),
];

// ── Fuzz cases ──────────────────────────────────────────────────────────────

/** Committed with this seed and count; the generated SQL file is built from them. */
export const FUZZ_SEED = 20261028;
export const FUZZ_COUNT = 300;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FUZZ_OFFICES: (CaseOffice | null)[] = [
  null,
  { qboCurrency: "CAD", province: "Texas" },
  { qboCurrency: "USD", province: "Ontario" },
  { qboCurrency: null, province: "Ontario" },
  { qboCurrency: null, province: "Texas" },
  { qboCurrency: "EUR", province: "Quebec" },
];

const FUZZ_TAX_PERCENTS = [0, 5, 7.5, 9.975, 13, 14.975, 15];

/**
 * Valid scenarios from a seed: whole-number cents, non-negative `percentage_bps`, no zero payment,
 * no deleted payment aimed at an installment. The twin throws outside that domain and the SQL does
 * not check it. The same seed gives the same cases, and the first n of a longer run are the same as a
 * run of n.
 */
export function makeFuzzCases(seed: number, count: number): AmountDueCase[] {
  const rand = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const chance = (p: number) => rand() < p;
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];

  const cases: AmountDueCase[] = [];
  for (let i = 0; i < count; i++) {
    const today = addDays(TODAY, int(-30, 30));
    const office = pick(FUZZ_OFFICES);
    const currency = office
      ? resolveOfficeCurrency(office.qboCurrency, office.province)
      : ("USD" as Currency);
    const otherCurrency = currency === "USD" ? "CAD" : "USD";
    const eventStart = addDays(today, int(-60, 60));

    const lineItems: CaseLineItem[] = Array.from({ length: int(0, 4) }, () => ({
      cents: chance(0.15) ? -int(1, 50000) : int(1, 150000),
      quantity: chance(0.15) ? null : int(1, 5),
      deleted: chance(0.15),
    }));
    const lineTotal = lineItems
      .filter((l) => !l.deleted)
      .reduce((sum, l) => sum + (l.quantity ?? 1) * l.cents, 0);

    // Percentages that add to 10000 most of the time, sometimes not. Dates are not sorted, so the
    // ids (which follow the list order) do not follow the due dates.
    const installmentCount = chance(0.3) ? 0 : int(1, 5);
    let bps: number[];
    if (chance(0.85)) {
      const cuts = Array.from({ length: installmentCount - 1 }, () => int(0, 10000)).sort(
        (a, b) => a - b,
      );
      const edges = [0, ...cuts, 10000];
      bps = edges.slice(1).map((edge, n) => edge - edges[n]);
    } else {
      bps = Array.from({ length: installmentCount }, () => int(0, 6000));
      if (installmentCount > 0 && bps.reduce((s, v) => s + v, 0) === 10000) bps[0] += 1;
    }
    if (installmentCount === 0) bps = [];
    const installments = bps.map((percentageBps) => ({
      dueDate: addDays(today, int(-60, 60)),
      percentageBps,
    }));

    const roughTotal = Math.min(Math.max(lineTotal, 2), 300000);
    const payments: CasePayment[] = Array.from({ length: int(0, 8) }, () => {
      const magnitude = int(1, roughTotal);
      const deleted = chance(0.08);
      const aimed = !deleted && installments.length > 0 && chance(0.5);
      return {
        amountCents: chance(0.2) ? -magnitude : magnitude,
        currency: chance(0.85)
          ? pick([currency, currency, currency.toLowerCase(), ` ${currency} `])
          : otherCurrency,
        status: chance(0.85) ? "succeeded" : pick(["pending", "failed"]),
        deleted,
        installment: aimed
          ? int(0, installments.length - 1)
          : !deleted && chance(0.08)
            ? "other-event"
            : null,
      };
    });

    const bookedAt = chance(0.2)
      ? null
      : `${addDays(eventStart, -int(0, 40))}T${pick(["03:15:00", "12:00:00", "23:45:00"])}+00:00`;

    const base: AmountDueCase = {
      name: `fuzz ${seed}/${i}`,
      office,
      event: {
        event_start: eventStart,
        booked_at: bookedAt,
        tax_percent: chance(0.4) ? pick(FUZZ_TAX_PERCENTS) : null,
        tax_amount_cents: chance(0.15) ? int(0, 3000) : null,
      },
      lineItems,
      installments,
      payments,
      today,
      expected: { total: 0, received: 0, remaining: 0, amountDue: 0 },
    };
    const result = runTwin(base, HAND_CASES.length + i);
    cases.push({
      ...base,
      expected: {
        total: result.totalCents,
        received: result.receivedCents,
        remaining: result.remainingCents,
        amountDue: result.amountDueCents,
      },
    });
  }
  return cases;
}

/** What the generated SQL file holds: the hand cases, then the committed fuzz run. */
export function allAmountDueCases(): AmountDueCase[] {
  return [...HAND_CASES, ...makeFuzzCases(FUZZ_SEED, FUZZ_COUNT)];
}
