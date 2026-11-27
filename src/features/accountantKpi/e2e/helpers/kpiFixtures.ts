import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SeededBooking } from "../../../accountantCollections/e2e/helpers/collectionsFixtures";

/**
 * Service-role helper for the KPI e2e specs (docs/specs/accountant-kpi.md §3). It runs in the Node
 * side of the test and writes the seeded database directly: a booked event with a line item, its
 * payment schedule and its payments, each on the day the scenario says. Needs
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (loaded from .env.local by `test:e2e`).
 * Removing the events is `cleanupBookings` of the Collections helpers, which cascades to the rows
 * written here.
 *
 * The KPI is an average over every booked event in the database, so a scenario works in a month
 * of its own, far from any seeded data (2031): its numbers come from its own events only.
 */

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("e2e helper needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** A schedule row: due on `dueDate` (`YYYY-MM-DD`), worth `percentageBps` of the total. */
export type KpiScheduleRow = { dueDate: string; percentageBps: number };

/**
 * 17:00 UTC on the day: noon in Toronto in winter and 13:00 in summer, so the office's calendar
 * day is `day` whichever way the clocks stand.
 */
const paidAtOf = (day: string) => `${day}T17:00:00.000Z`;

/**
 * A booked event of `valueCents` (default $1,000.00, no tax). `schedule` gives the rows in order,
 * the first one due on signing, as the app writes a schedule; leave it out for an event with no
 * schedule. `payments` are manual payments naming no installment, so they pay the schedule from
 * the oldest row on.
 */
export async function createKpiBooking(options: {
  name: string;
  valueCents?: number;
  schedule?: KpiScheduleRow[];
  payments?: { amountCents: number; paidDay: string }[];
}): Promise<SeededBooking> {
  const db = admin();
  const invoiceNumber = 900_000_000 + Math.floor(Math.random() * 90_000_000);

  const { data: event, error } = await db
    .from("Events")
    .insert({
      event_name: options.name,
      event_start: "2031-12-01",
      event_end: "2031-12-02",
      lenient: false,
      must_be_clean: false,
      event_status: "booked",
      booked_at: new Date().toISOString(),
      invoice_number: invoiceNumber,
      tax_percent: 0,
      tax_amount_cents: 0,
    })
    .select("id")
    .single();
  if (error || !event) throw new Error(`createKpiBooking: event insert failed: ${error?.message}`);
  const eventId = event.id as string;

  const { error: lineError } = await db.from("EventLineItems").insert({
    event_uuid: eventId,
    header: "Bleacher Rental",
    description: "10 row",
    quantity: 1,
    value_cents: options.valueCents ?? 100_000,
    currency: "USD",
    is_template: false,
    deleted: false,
  });
  if (lineError) throw new Error(`createKpiBooking: line item failed: ${lineError.message}`);

  if (options.schedule?.length) {
    const { error: scheduleError } = await db.from("PaymentInstallments").insert(
      options.schedule.map((row, index) => ({
        event_uuid: eventId,
        due_date: row.dueDate,
        currency: "USD" as const,
        percentage_bps: row.percentageBps,
        due_on_signing: index === 0,
      })),
    );
    if (scheduleError)
      throw new Error(`createKpiBooking: schedule insert failed: ${scheduleError.message}`);
  }

  for (const payment of options.payments ?? []) {
    await addKpiPayment(eventId, payment.amountCents, payment.paidDay);
  }

  return { eventId, name: options.name };
}

/** A manual payment of `amountCents` that arrived on `paidDay` (`YYYY-MM-DD`, Toronto's day). */
export async function addKpiPayment(
  eventId: string,
  amountCents: number,
  paidDay: string,
): Promise<void> {
  const { error } = await admin()
    .from("PaymentHistory")
    .insert({
      event_uuid: eventId,
      amount_cents: amountCents,
      currency: "USD",
      status: "succeeded",
      payment_method_type: "check",
      payer_name: "E2E Payer",
      entry_source: "manual",
      paid_at: paidAtOf(paidDay),
    });
  if (error) throw new Error(`addKpiPayment: ${error.message}`);
}

/** Moves the due date of the event's `index`-th schedule row (0 is the first, due on signing). */
export async function moveDueDate(eventId: string, index: number, dueDate: string): Promise<void> {
  const db = admin();
  const { data, error } = await db
    .from("PaymentInstallments")
    .select("id")
    .eq("event_uuid", eventId)
    .order("due_on_signing", { ascending: false })
    .order("due_date", { ascending: true });
  if (error || !data?.[index]) throw new Error(`moveDueDate: no row ${index}: ${error?.message}`);
  const { error: updateError } = await db
    .from("PaymentInstallments")
    .update({ due_date: dueDate })
    .eq("id", data[index].id as string);
  if (updateError) throw new Error(`moveDueDate: ${updateError.message}`);
}
