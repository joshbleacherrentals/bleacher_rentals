import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { QuotesBookingsEvent } from "@/features/quotesAndBookings/types";
import { withReceivableBalances } from "@/features/quotesAndBookings/utils/accountsReceivable";
import {
  FUZZ_COUNT,
  FUZZ_SEED,
  HAND_CASES,
  allAmountDueCases,
  caseCurrency,
  makeFuzzCases,
  runTwin,
  toTwinInput,
  type AmountDueCase,
} from "./amountDueCases";
import { buildParitySql } from "./amountDueParitySql";

/**
 * The TypeScript half of the guarantee that the Postgres functions of spec 02 and the twin give
 * the same numbers (docs/specs/accountant-collections-03-ts-twin-and-parity.md).
 *
 * The same cases become `supabase/tests/ar_amount_due_parity.test.sql`, which `supabase test db`
 * runs against `ar_event_balances`. If the twin or a case changes without a regenerated file, the
 * drift test fails; if the SQL disagrees with the file, pgTAP fails.
 */

const PARITY_FILE = fileURLToPath(
  new URL("../../../../supabase/tests/ar_amount_due_parity.test.sql", import.meta.url),
);

const ALL_CASES = allAmountDueCases();

describe("hand cases", () => {
  it("has a name for every case, and no name twice", () => {
    const names = HAND_CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.trim().length > 0)).toBe(true);
  });

  it.each(HAND_CASES.map((c) => [c.name, c] as const))(
    "the twin gives the hand-written numbers: %s",
    (_name, c) => {
      const result = runTwin(c);
      expect({
        total: result.totalCents,
        received: result.receivedCents,
        remaining: result.remainingCents,
        amountDue: result.amountDueCents,
      }).toEqual(c.expected);
    },
  );
});

describe("fuzz cases", () => {
  const fuzz = makeFuzzCases(FUZZ_SEED, FUZZ_COUNT);

  it("is deterministic for a seed and different for another", () => {
    expect(makeFuzzCases(FUZZ_SEED, 20)).toEqual(fuzz.slice(0, 20));
    expect(makeFuzzCases(FUZZ_SEED + 1, 20)).not.toEqual(fuzz.slice(0, 20));
  });

  it("builds the committed number of cases", () => {
    expect(fuzz).toHaveLength(FUZZ_COUNT);
  });

  it("covers the situations it is meant to (so it cannot go quietly empty)", () => {
    const count = (pred: (c: AmountDueCase) => boolean) => fuzz.filter(pred).length;
    expect(count((c) => c.installments.length > 0)).toBeGreaterThan(100);
    expect(count((c) => c.installments.length === 0)).toBeGreaterThan(20);
    expect(count((c) => c.expected.amountDue > 0)).toBeGreaterThan(80);
    expect(count((c) => c.expected.amountDue === 0)).toBeGreaterThan(20);
    expect(count((c) => c.payments.some((p) => p.amountCents < 0))).toBeGreaterThan(20);
    expect(count((c) => c.payments.some((p) => p.deleted))).toBeGreaterThan(10);
    expect(count((c) => c.payments.some((p) => p.status !== "succeeded"))).toBeGreaterThan(10);
    expect(count((c) => c.payments.some((p) => p.installment === "other-event"))).toBeGreaterThan(
      5,
    );
    expect(
      count(
        (c) =>
          c.installments.length > 0 &&
          c.installments.reduce((s, i) => s + i.percentageBps, 0) !== 10000,
      ),
    ).toBeGreaterThan(5);
  });

  it("only produces values inside the domain the SQL accepts", () => {
    for (const c of fuzz) {
      expect(Number.isInteger(c.event.tax_amount_cents ?? 0)).toBe(true);
      for (const l of c.lineItems) expect(Number.isInteger(l.cents)).toBe(true);
      for (const i of c.installments) {
        expect(Number.isInteger(i.percentageBps)).toBe(true);
        expect(i.percentageBps).toBeGreaterThanOrEqual(0);
      }
      for (const p of c.payments) {
        expect(Number.isInteger(p.amountCents)).toBe(true);
        expect(p.amountCents).not.toBe(0);
        if (p.deleted) expect(p.installment ?? null).toBeNull();
      }
    }
  });
});

describe("invariants of the twin, over every case", () => {
  it.each(ALL_CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const result = runTwin(c);

    expect(result.amountDueCents).toBeGreaterThanOrEqual(0);
    expect(result.amountDueCents).toBeLessThanOrEqual(result.remainingCents);
    expect(result.remainingCents).toBe(Math.max(result.totalCents - result.receivedCents, 0));

    const currency = caseCurrency(c);
    const counted = c.payments
      .filter(
        (p) =>
          !p.deleted && p.status === "succeeded" && p.currency.trim().toUpperCase() === currency,
      )
      .reduce((sum, p) => sum + p.amountCents, 0);
    expect(result.receivedCents).toBe(counted);

    if (c.installments.length > 0) {
      const input = toTwinInput(c);
      const [ar] = withReceivableBalances(
        [
          {
            id: "e",
            tax_amount_cents: input.event.tax_amount_cents,
            tax_percent: input.event.tax_percent,
          } as unknown as QuotesBookingsEvent,
        ],
        {
          lineTotals: [{ event_uuid: "e", line_total_cents: input.lineTotalCents }],
          installments: input.installments.map((i) => ({ ...i, event_uuid: "e" })),
          payments: input.payments.map((p) => ({ ...p, event_uuid: "e" })),
        },
        () => input.currency,
        input.today,
      );
      expect(result.amountDueCents).toBe(ar.amount_due_cents);
      expect(result.remainingCents).toBe(ar.remaining_balance_cents);
    } else {
      expect([0, result.remainingCents]).toContain(result.amountDueCents);
    }

    if (result.amountDueCents === 0) {
      expect(result.overdueSince).toBeNull();
      expect(result.daysOverdue).toBeNull();
    }
  });
});

describe("drift between the cases and supabase/tests/ar_amount_due_parity.test.sql", () => {
  const generated = buildParitySql(ALL_CASES);

  it("plans exactly one assertion per case", () => {
    expect(generated).toContain(`SELECT plan(${ALL_CASES.length});`);
    expect(generated.match(/^SELECT is\(/gm)).toHaveLength(ALL_CASES.length);
    expect(generated.trimEnd().endsWith("ROLLBACK;")).toBe(true);
  });

  it("matches the committed file byte for byte", () => {
    if (process.env.UPDATE_PARITY === "1") {
      writeFileSync(PARITY_FILE, generated);
      return;
    }
    const committed = readFileSync(PARITY_FILE, "utf8");
    expect(
      committed === generated,
      "supabase/tests/ar_amount_due_parity.test.sql is out of date. If a rule changed on purpose, " +
        "change the SQL too, then regenerate it with: UPDATE_PARITY=1 npx vitest run amountDueParity",
    ).toBe(true);
  });
});
