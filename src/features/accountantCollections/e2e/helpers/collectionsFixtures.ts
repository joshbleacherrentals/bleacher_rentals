import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role helper for the Collections e2e specs (docs/specs/accountant-collections-09-design.md
 * §5). It runs in the Node side of the test and writes the seeded database directly: an Event, a
 * line item, and the open task. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (loaded from .env.local by the `test:e2e` script).
 *
 * The events have no payment schedule and start inside 7 days, so their whole balance is overdue
 * at once (spec 01 §0, decision 3) and the daily job would give them a task anyway.
 */

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("e2e helper needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SeededBooking = { eventId: string; name: string };

const isoDate = (offsetDays: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/**
 * A booked, overdue event with one open task. `taskDueInDays` is relative to today: negative for a
 * past task, 0 for today, positive for one that is not due yet.
 */
export async function createOverdueBooking(options: {
  name: string;
  valueCents?: number;
  taskDueInDays: number;
  taskNote?: string;
  status?: "booked" | "lost" | "quoted";
  withOpenTask?: boolean;
}): Promise<SeededBooking> {
  const db = admin();
  const invoiceNumber = 900_000_000 + Math.floor(Math.random() * 90_000_000);

  const { data: event, error } = await db
    .from("Events")
    .insert({
      event_name: options.name,
      event_start: isoDate(3),
      event_end: isoDate(4),
      lenient: false,
      must_be_clean: false,
      event_status: options.status ?? "booked",
      booked_at: new Date().toISOString(),
      invoice_number: invoiceNumber,
      tax_percent: 0,
      tax_amount_cents: 0,
    })
    .select("id")
    .single();
  if (error || !event)
    throw new Error(`createOverdueBooking: event insert failed: ${error?.message}`);
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
  if (lineError) throw new Error(`createOverdueBooking: line item failed: ${lineError.message}`);

  if (options.withOpenTask !== false) {
    const { error: taskError } = await db.from("ArEventTasks").insert({
      event_uuid: eventId,
      due_date: isoDate(options.taskDueInDays),
      completed: false,
      note: options.taskNote ?? "Remind the customer about payment",
    });
    if (taskError)
      throw new Error(`createOverdueBooking: task insert failed: ${taskError.message}`);
  }

  return { eventId, name: options.name };
}

/** Removes the events; their tasks, line items and payments go with them (cascade). */
export async function cleanupBookings(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  await admin().from("Events").delete().in("id", eventIds);
}

/** The event's tasks, open ones first. */
export async function tasksOf(
  eventId: string,
): Promise<{ note: string; completed: boolean; due_date: string }[]> {
  const { data, error } = await admin()
    .from("ArEventTasks")
    .select("note, completed, due_date")
    .eq("event_uuid", eventId)
    .order("completed", { ascending: true });
  if (error) throw new Error(`tasksOf: ${error.message}`);
  return data ?? [];
}

/** A manual payment for the whole balance, as the Record Payment dialog would write it. */
export async function payInFull(eventId: string, amountCents = 100_000): Promise<void> {
  const { error } = await admin().from("PaymentHistory").insert({
    event_uuid: eventId,
    amount_cents: amountCents,
    currency: "USD",
    status: "succeeded",
    payment_method_type: "check",
    payer_name: "E2E Payer",
    entry_source: "manual",
    paid_at: new Date().toISOString(),
  });
  if (error) throw new Error(`payInFull: ${error.message}`);
}
