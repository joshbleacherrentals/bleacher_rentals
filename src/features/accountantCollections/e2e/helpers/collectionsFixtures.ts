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

/** The name every terms template made by `addSignature` starts with, so cleanup finds only those. */
const E2E_TERMS_PREFIX = "E2E Collections terms";

/**
 * Removes the events; their tasks, line items and payments go with them (cascade). The objects
 * that `addEventFile` stored in `event-files` are removed first, since the rows that name them go
 * with the events. A signature does not cascade (its foreign key has no ON DELETE), so the
 * signatures that `addSignature` wrote go first, with their PDFs and their terms template.
 */
export async function cleanupBookings(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const db = admin();
  const { data: files } = await db
    .from("EventFiles")
    .select("storage_path")
    .in("event_uuid", eventIds);
  const stored = (files ?? [])
    .map((f) => f.storage_path as string | null)
    .filter((path): path is string => !!path && !path.startsWith("contracts/"));
  if (stored.length > 0) await db.storage.from("event-files").remove(stored);

  const { data: signatures } = await db
    .from("ContractSignatures")
    .select("signed_pdf_path, terms_and_conditions_uuid")
    .in("event_uuid", eventIds);
  if (signatures && signatures.length > 0) {
    const pdfs = signatures
      .map((s) => s.signed_pdf_path as string | null)
      .filter((path): path is string => !!path);
    if (pdfs.length > 0) await db.storage.from("contracts").remove(pdfs);
    await db.from("ContractSignatures").delete().in("event_uuid", eventIds);
    await db
      .from("TermsAndConditions")
      .delete()
      .in(
        "id",
        signatures.map((s) => s.terms_and_conditions_uuid as string),
      )
      .like("name", `${E2E_TERMS_PREFIX}%`);
  }
  await db.from("Events").delete().in("id", eventIds);
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

/** A task of the event, completed or open, `dueInDays` from today (negative for the past). */
export async function addTask(
  eventId: string,
  options: { dueInDays: number; note: string; completed: boolean },
): Promise<void> {
  const { error } = await admin()
    .from("ArEventTasks")
    .insert({
      event_uuid: eventId,
      due_date: isoDate(options.dueInDays),
      completed: options.completed,
      note: options.note,
    });
  if (error) throw new Error(`addTask: ${error.message}`);
}

/**
 * A file of the event, as the app stores one: the object in `event-files` (unless `source` is
 * `signed_contract`, whose object lives in the `contracts` bucket and is not created here) and its
 * EventFiles row. Returns the row's id.
 */
export async function addEventFile(
  eventId: string,
  options: {
    name: string;
    source: "upload" | "sent_quote" | "signed_contract" | "email_attachment";
  },
): Promise<string> {
  const db = admin();
  const id = crypto.randomUUID();
  const extension = options.name.split(".").pop() ?? "bin";
  let storagePath = `contracts/${eventId}/${id}.${extension}`;
  if (options.source !== "signed_contract") {
    storagePath = `${eventId}/${id}.${extension}`;
    const { error: uploadError } = await db.storage
      .from("event-files")
      .upload(storagePath, new Blob(["%PDF-1.4 e2e"], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    if (uploadError) throw new Error(`addEventFile: upload failed: ${uploadError.message}`);
  }
  const { error } = await db.from("EventFiles").insert({
    id,
    event_uuid: eventId,
    file_name: options.name,
    storage_path: storagePath,
    mime_type: "application/pdf",
    file_size_bytes: 12,
    source: options.source,
  });
  if (error) throw new Error(`addEventFile: row insert failed: ${error.message}`);
  return id;
}

/**
 * A contract signature of the event, as the sign route leaves it (and a terms template of its
 * own, which the signature must name). `pdf` is what the signature stored:
 * - `stored`: a PDF in the `contracts` bucket at `<event id>/<signature id>.pdf`, that path in
 *   `signed_pdf_path`;
 * - `none`: no path (the signature was saved, the upload failed);
 * - `missing`: a path with no object behind it.
 * Returns the signature's id and the path it wrote (`null` for `none`).
 */
export async function addSignature(
  eventId: string,
  options: { status: "active" | "invalidated"; pdf: "stored" | "none" | "missing" },
): Promise<{ id: string; path: string | null }> {
  const db = admin();
  const id = crypto.randomUUID();
  const path = options.pdf === "none" ? null : `${eventId}/${id}.pdf`;

  const { data: terms, error: termsError } = await db
    .from("TermsAndConditions")
    .insert({ name: `${E2E_TERMS_PREFIX} ${id}`, html_content: "<p>E2E terms</p>" })
    .select("id")
    .single();
  if (termsError || !terms)
    throw new Error(`addSignature: terms insert failed: ${termsError?.message}`);

  if (options.pdf === "stored" && path) {
    const { error: uploadError } = await db.storage
      .from("contracts")
      .upload(path, new Blob(["%PDF-1.4 e2e signed"], { type: "application/pdf" }), {
        contentType: "application/pdf",
      });
    if (uploadError) throw new Error(`addSignature: upload failed: ${uploadError.message}`);
  }

  const { error } = await db.from("ContractSignatures").insert({
    id,
    event_uuid: eventId,
    terms_and_conditions_uuid: terms.id as string,
    signer_name: "E2E Signer",
    status: options.status,
    signed_pdf_path: path,
    invalidated_at: options.status === "invalidated" ? new Date().toISOString() : null,
  });
  if (error) throw new Error(`addSignature: row insert failed: ${error.message}`);
  return { id, path };
}

/** The names of the event's EventFiles rows, oldest first, with their source. */
export async function eventFilesOf(
  eventId: string,
): Promise<{ file_name: string; source: string }[]> {
  const { data, error } = await admin()
    .from("EventFiles")
    .select("file_name, source")
    .eq("event_uuid", eventId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`eventFilesOf: ${error.message}`);
  return data ?? [];
}
