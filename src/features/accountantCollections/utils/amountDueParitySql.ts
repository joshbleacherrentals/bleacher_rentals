import { addDays } from "./calendarDays";
import { caseCurrency, caseId, type AmountDueCase, type CaseOffice } from "./amountDueCases";

/**
 * Turns the shared cases into one pgTAP file (docs/specs/accountant-collections-03).
 *
 * For every case: the fixture rows (ids derived from the case's position in the list), then one
 * `is()` that compares `(total, received, remaining, amount due)` from `ar_event_balances(event,
 * today)` with the case's `expected`. The file rolls back, like the other files in supabase/tests.
 *
 * The output is deterministic, because `amountDueParity.test.ts` compares it with the committed
 * file byte for byte.
 */

const PARITY_USER_ID = "f0000000-0000-4000-8000-000000000001";

const sqlString = (value: string) =>
  `'${value.replace(/[\u0000-\u001f]/g, " ").replace(/'/g, "''")}'`;
const sqlNullable = (value: string | number | null) =>
  value === null ? "NULL" : typeof value === "number" ? String(value) : sqlString(value);

type OfficeIds = { qbo: string; address: string; office: string };

function officeKey(office: CaseOffice): string {
  return JSON.stringify([office.qboCurrency, office.province]);
}

function tail(n: number): string {
  return `-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function buildParitySql(cases: readonly AmountDueCase[]): string {
  const out: string[] = [];

  // The offices: one set of rows per distinct (QuickBooks currency, province), in order of first use.
  const offices = new Map<string, { office: CaseOffice; ids: OfficeIds }>();
  for (const c of cases) {
    if (!c.office || offices.has(officeKey(c.office))) continue;
    const n = offices.size + 1;
    offices.set(officeKey(c.office), {
      office: c.office,
      ids: {
        qbo: `0b0b0000${tail(n)}`,
        address: `0add0000${tail(n)}`,
        office: `0ff1ce00${tail(n)}`,
      },
    });
  }
  const needsUser = cases.some((c) => c.payments.some((p) => p.deleted));

  out.push(
    `-- ============================================================================`,
    `-- GENERATED FILE. Do not edit by hand.`,
    `--`,
    `-- Parity of the TypeScript twin and the Postgres port of the Amount Due calculation.`,
    `-- Spec:    docs/specs/accountant-collections-03-ts-twin-and-parity.md`,
    `-- Source:  src/features/accountantCollections/utils/amountDueCases.ts`,
    `-- Builder: src/features/accountantCollections/utils/amountDueParitySql.ts`,
    `-- Regenerate (only when a rule changed on purpose, and the SQL was changed to match):`,
    `--   UPDATE_PARITY=1 npx vitest run amountDueParity`,
    `--`,
    `-- Every case builds one event with its line items, installments and payments, then compares`,
    `-- (total, received, remaining, amount due) from public.ar_event_balances(event, today) with the`,
    `-- numbers of the case. The hand cases carry numbers worked out by hand; the fuzz cases carry the`,
    `-- TypeScript twin's numbers, so a failure there means the SQL is wrong, not that the file should`,
    `-- be regenerated.`,
    `--`,
    `-- Everything runs in a transaction that is ROLLED BACK at the end.`,
    `--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \\`,
    `--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_amount_due_parity.test.sql`,
    `-- ============================================================================`,
    ``,
    `\\set ON_ERROR_STOP on`,
    `\\timing off`,
    ``,
    `BEGIN;`,
    `SET search_path TO extensions, public, "$user";`,
    `SELECT plan(${cases.length});`,
    ``,
  );

  if (needsUser) {
    out.push(
      `-- The one user a soft-deleted payment is attributed to (the table wants a manual, attributed row).`,
      `INSERT INTO public."Users" (id, first_name, last_name, email, clerk_user_id, is_admin, is_viewer)`,
      `VALUES (${sqlString(PARITY_USER_ID)}, 'T', 'parity', 'ar_parity_user@test.com', 'clerk_ar_parity_user', true, false);`,
      ``,
    );
  }

  if (offices.size > 0) {
    out.push(`-- Offices: one per distinct (QuickBooks currency, province).`);
    for (const { office, ids } of offices.values()) {
      out.push(
        `INSERT INTO public."QboConnections" (id, display_name, encrypted_token_value, currency)`,
        `VALUES (${sqlString(ids.qbo)}, 'parity qbo', 'x', ${sqlNullable(office.qboCurrency)});`,
      );
      if (office.province !== null) {
        out.push(
          `INSERT INTO public."Addresses" (id, street, city, state_province)`,
          `VALUES (${sqlString(ids.address)}, '1 Test St', 'Parity', ${sqlString(office.province)});`,
        );
      }
      out.push(
        `INSERT INTO public."SalesOffices" (id, name, address_uuid, quickbook_uuid)`,
        `VALUES (${sqlString(ids.office)}, 'parity office', ${office.province === null ? "NULL" : sqlString(ids.address)}, ${sqlString(ids.qbo)});`,
      );
    }
    out.push(``);
  }

  cases.forEach((c, index) => {
    const eventId = caseId("event", index);
    const currency = caseCurrency(c);
    const officeId = c.office ? offices.get(officeKey(c.office))!.ids.office : null;

    out.push(`-- ── case ${index}: ${c.name.replace(/[\u0000-\u001f]/g, " ")} ──`);

    out.push(
      `INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean, sales_office_uuid, tax_percent, tax_amount_cents, booked_at)`,
      `VALUES (${sqlString(eventId)}, ${sqlString(`parity case ${index}`)}, ${sqlString(c.event.event_start)}, ${sqlString(addDays(c.event.event_start, 1))}, false, false, ${sqlNullable(officeId)}, ${sqlNullable(c.event.tax_percent)}, ${sqlNullable(c.event.tax_amount_cents)}, ${sqlNullable(c.event.booked_at)});`,
    );

    if (c.payments.some((p) => p.installment === "other-event")) {
      const otherEvent = caseId("otherEvent", index);
      out.push(
        `INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean)`,
        `VALUES (${sqlString(otherEvent)}, ${sqlString(`parity case ${index} other event`)}, '2027-06-01', '2027-06-02', false, false);`,
        `INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps)`,
        `VALUES (${sqlString(caseId("otherInstallment", index))}, ${sqlString(otherEvent)}, '2026-10-01', ${sqlString(currency)}, 10000);`,
      );
    }

    if (c.lineItems.length > 0) {
      out.push(
        `INSERT INTO public."EventLineItems" (id, header, currency, value_cents, quantity, event_uuid, deleted) VALUES`,
        c.lineItems
          .map(
            (l, n) =>
              `  (${sqlString(caseId("line", index, n + 1))}, 'line', ${sqlString(currency)}, ${l.cents}, ${sqlNullable(l.quantity)}, ${sqlString(eventId)}, ${l.deleted ? "true" : "false"})`,
          )
          .join(",\n") + ";",
      );
    }

    if (c.installments.length > 0) {
      out.push(
        `INSERT INTO public."PaymentInstallments" (id, event_uuid, due_date, currency, percentage_bps) VALUES`,
        c.installments
          .map(
            (i, n) =>
              `  (${sqlString(caseId("installment", index, n + 1))}, ${sqlString(eventId)}, ${sqlString(i.dueDate)}, ${sqlString(currency)}, ${i.percentageBps})`,
          )
          .join(",\n") + ";",
      );
    }

    if (c.payments.length > 0) {
      out.push(
        `INSERT INTO public."PaymentHistory" (id, event_uuid, installment_id, amount_cents, currency, status, payer_name, entry_source, payment_method_type, recorded_by_user_uuid, deleted_at, deleted_by_user_uuid, delete_reason) VALUES`,
        c.payments
          .map((p, n) => {
            const installmentId =
              p.installment === null || p.installment === undefined
                ? null
                : p.installment === "other-event"
                  ? caseId("otherInstallment", index)
                  : caseId("installment", index, p.installment + 1);
            const attribution = p.deleted
              ? `'manual', 'check', ${sqlString(PARITY_USER_ID)}, now(), ${sqlString(PARITY_USER_ID)}, 'parity'`
              : `'stripe', NULL, NULL, NULL, NULL, NULL`;
            return `  (${sqlString(caseId("payment", index, n + 1))}, ${sqlString(eventId)}, ${sqlNullable(installmentId)}, ${p.amountCents}, ${sqlString(p.currency)}, ${sqlString(p.status)}, 'Parity', ${attribution})`;
          })
          .join(",\n") + ";",
      );
    }

    const { total, received, remaining, amountDue } = c.expected;
    out.push(
      `SELECT is(`,
      `  (SELECT ROW(b.total_cents, b.received_cents, b.remaining_cents, b.amount_due_cents)::text`,
      `   FROM public.ar_event_balances(${sqlString(eventId)}, ${sqlString(c.today)}) b),`,
      `  ${sqlString(`(${total},${received},${remaining},${amountDue})`)},`,
      `  ${sqlString(`case ${index}: ${c.name}`)}`,
      `);`,
      ``,
    );
  });

  out.push(`SELECT * FROM finish();`, `ROLLBACK;`, ``);
  return out.join("\n");
}
