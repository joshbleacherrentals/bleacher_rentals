import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role helper for the Collections e2e specs (docs/specs/accountant-collections-09-design.md
 * §5). It runs in the Node side of the test and writes the seeded database directly: an Event, a
 * line item, and the open task. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (loaded from .env.local by the `test:e2e` script).
 *
 * The events have no payment schedule and start today, so their whole balance is overdue from
 * the start day (docs/specs/accountant-collections-24-no-schedule-due-on-start-day.md) and the daily
 * job would give them a task anyway. `startInDays` moves the start: an event that starts later is
 * not overdue, one that started already is.
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
 * Toronto's calendar date `offsetDays` from today: the day the database counts an event's start
 * from (`ar_sync_event_tasks` takes Toronto's date). The UTC date differs from it in the evening.
 */
const officeIsoDate = (offsetDays: number): string => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(
    new Date(),
  );
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/**
 * A booked event with one open task; with no payment schedule it is overdue from the day it starts,
 * which is today unless `startInDays` says otherwise (negative: started already, positive: not
 * overdue yet). `taskDueInDays` is relative to today: negative for a past task, 0 for today,
 * positive for one that is not due yet.
 */
export async function createOverdueBooking(options: {
  name: string;
  valueCents?: number;
  taskDueInDays: number;
  taskNote?: string;
  status?: "booked" | "lost" | "quoted";
  withOpenTask?: boolean;
  /** Days from today until the event starts; 0 (today) when left out. */
  startInDays?: number;
}): Promise<SeededBooking> {
  const db = admin();
  const invoiceNumber = 900_000_000 + Math.floor(Math.random() * 90_000_000);
  const startInDays = options.startInDays ?? 0;

  const { data: event, error } = await db
    .from("Events")
    .insert({
      event_name: options.name,
      event_start: officeIsoDate(startInDays),
      event_end: officeIsoDate(startInDays + 1),
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
/** The last name of the contact made by `addFrenchContact`, so cleanup finds only those. */
const E2E_FRENCH_CONTACT_LAST_NAME = "E2E Collections French";

/**
 * Removes the events; their tasks, line items and payments go with them (cascade). The objects
 * that `addEventFile` stored in `event-files` are removed first, since the rows that name them go
 * with the events. A signature does not cascade (its foreign key has no ON DELETE), so the
 * signatures that `addSignature` wrote go first, with their PDFs and their terms template. The
 * activity log does not cascade either: the rows `addBookedLog` wrote (and any the app wrote) go
 * before the events.
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
  await db.from("EventChangeLog").delete().in("event_uuid", eventIds);
  // The terms and contacts that `addContractTerms` and `addFrenchContact` gave the events: the
  // events refer to them, so they go after the events.
  const { data: given } = await db
    .from("Events")
    .select("terms_and_conditions_uuid, contact_uuid")
    .in("id", eventIds);
  await db.from("Events").delete().in("id", eventIds);
  const termsIds = (given ?? []).map((e) => e.terms_and_conditions_uuid as string | null);
  const contactIds = (given ?? []).map((e) => e.contact_uuid as string | null);
  if (termsIds.some(Boolean)) {
    await db
      .from("TermsAndConditions")
      .delete()
      .in(
        "id",
        termsIds.filter((id): id is string => !!id),
      )
      .like("name", `${E2E_TERMS_PREFIX}%`);
  }
  if (contactIds.some(Boolean)) {
    await db
      .from("Contacts")
      .delete()
      .in(
        "id",
        contactIds.filter((id): id is string => !!id),
      )
      .like("last_name", `${E2E_FRENCH_CONTACT_LAST_NAME}%`);
  }
}

/**
 * The event's tasks, open ones first, with the hidden ones too: `deleted_at` is the moment a closed
 * task was deleted from Task History, and null for every task that is still shown
 * (docs/specs/accountant-collections-19-task-delete.md §3).
 */
export async function tasksOf(
  eventId: string,
): Promise<{ note: string; completed: boolean; due_date: string; deleted_at: string | null }[]> {
  const { data, error } = await admin()
    .from("ArEventTasks")
    .select("note, completed, due_date, deleted_at")
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

/**
 * A payment schedule for the event: one `PaymentInstallments` row per entry, due `dueInDays` from
 * today (Toronto's date, negative for the past) and worth `percentageBps` of the total (10000 is
 * all of it). The schedule decides when the event is overdue, not its start date
 * (docs/specs/accountant-collections-24-no-schedule-due-on-start-day.md, S80).
 */
export async function addInstallments(
  eventId: string,
  installments: { dueInDays: number; percentageBps: number }[],
): Promise<void> {
  const { error } = await admin()
    .from("PaymentInstallments")
    .insert(
      installments.map((i) => ({
        event_uuid: eventId,
        due_date: officeIsoDate(i.dueInDays),
        currency: "USD" as const,
        percentage_bps: i.percentageBps,
      })),
    );
  if (error) throw new Error(`addInstallments: ${error.message}`);
}

/**
 * 17:00 UTC, `daysAgo` days before today: noon in Toronto, so the office's calendar day is the same
 * as the UTC one however the clocks stand (docs/specs/accountant-collections-18-task-finished-at.md).
 */
export function finishedMoment(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(17, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

/**
 * A task of the event, completed or open, `dueInDays` from today (negative for the past).
 * `finishedDaysAgo` writes an explicit `finished_at` for a completed task, which the trigger keeps.
 * Without it a completed task is stamped by the trigger with the moment of this insert: the API
 * cannot write a closed task that has no finish time (only a database session with the trigger off
 * can), so that case is covered by the SQL and unit tests, not by Playwright.
 */
export async function addTask(
  eventId: string,
  options: { dueInDays: number; note: string; completed: boolean; finishedDaysAgo?: number },
): Promise<void> {
  const { error } = await admin()
    .from("ArEventTasks")
    .insert({
      event_uuid: eventId,
      due_date: isoDate(options.dueInDays),
      completed: options.completed,
      note: options.note,
      ...(options.finishedDaysAgo === undefined
        ? {}
        : { finished_at: finishedMoment(options.finishedDaysAgo).toISOString() }),
    });
  if (error) throw new Error(`addTask: ${error.message}`);
}

/**
 * A file of the event, as the app stores one: the object in `event-files` (unless `source` is
 * `signed_contract`, whose object lives in the `contracts` bucket and is not created here) and its
 * EventFiles row. Returns the row's id. With `storagePath` given (the column is NOT NULL, so an
 * empty string is the closest to "no path") nothing is stored and the row carries that value.
 */
export async function addEventFile(
  eventId: string,
  options: {
    name: string;
    source: "upload" | "sent_quote" | "signed_contract" | "email_attachment";
    storagePath?: string;
  },
): Promise<string> {
  const db = admin();
  const id = crypto.randomUUID();
  const extension = options.name.split(".").pop() ?? "bin";
  let storagePath = `contracts/${eventId}/${id}.${extension}`;
  if (options.storagePath !== undefined) {
    storagePath = options.storagePath;
  } else if (options.source !== "signed_contract") {
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
 * `signedAt` (an ISO time) is when it was signed; without it the database stamps the insert.
 * Returns the signature's id and the path it wrote (`null` for `none`).
 */
export async function addSignature(
  eventId: string,
  options: {
    status: "active" | "invalidated";
    pdf: "stored" | "none" | "missing";
    signedAt?: string;
  },
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
    ...(options.signedAt ? { signed_at: options.signedAt } : {}),
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

/**
 * Gives the event a contract template it has not signed, so the customer's page offers Sign on its
 * Signed Contract tab (docs/specs/accountant-collections-16-customer-page-view.md §4, S44).
 */
export async function addContractTerms(eventId: string): Promise<void> {
  const db = admin();
  const { data: terms, error } = await db
    .from("TermsAndConditions")
    .insert({
      name: `${E2E_TERMS_PREFIX} ${crypto.randomUUID()}`,
      html_content: "<p>E2E terms</p>",
    })
    .select("id")
    .single();
  if (error || !terms) throw new Error(`addContractTerms: terms insert failed: ${error?.message}`);
  const { error: linkError } = await db
    .from("Events")
    .update({ terms_and_conditions_uuid: terms.id as string })
    .eq("id", eventId);
  if (linkError) throw new Error(`addContractTerms: link failed: ${linkError.message}`);
}

/**
 * Makes a contact whose preferred language is French the event's contact, so the customer's own
 * link is in French (S42: the invoice page's frame is English all the same).
 */
export async function addFrenchContact(eventId: string): Promise<void> {
  const db = admin();
  const { data: contact, error } = await db
    .from("Contacts")
    .insert({
      first_name: "E2E",
      last_name: `${E2E_FRENCH_CONTACT_LAST_NAME} ${crypto.randomUUID()}`,
      email: "e2e-french@example.com",
      preferred_language: "french",
      deleted: false,
    })
    .select("id")
    .single();
  if (error || !contact) throw new Error(`addFrenchContact: insert failed: ${error?.message}`);
  const { error: linkError } = await db
    .from("Events")
    .update({ contact_uuid: contact.id as string })
    .eq("id", eventId);
  if (linkError) throw new Error(`addFrenchContact: link failed: ${linkError.message}`);
}

/** The rows of the event's activity log that a customer's visit writes (S43). */
export async function clientActivityOf(eventId: string): Promise<string[]> {
  const { data, error } = await admin()
    .from("EventChangeLog")
    .select("action_type")
    .eq("event_uuid", eventId)
    .like("action_type", "client_%");
  if (error) throw new Error(`clientActivityOf: ${error.message}`);
  return (data ?? []).map((row) => row.action_type as string);
}

/** The event's active signatures, to see that Sign in the frame really signed (S44). */
export async function activeSignaturesOf(eventId: string): Promise<number> {
  const { count, error } = await admin()
    .from("ContractSignatures")
    .select("id", { count: "exact", head: true })
    .eq("event_uuid", eventId)
    .eq("status", "active");
  if (error) throw new Error(`activeSignaturesOf: ${error.message}`);
  return count ?? 0;
}

/**
 * The log row the status button on the quote card (or the edit page's save) leaves when it moves an
 * event to booked: `field_name = 'event_status'`, `next_value = 'booked'`, the manager's
 * `Users.id` and the time `at` (an ISO time)
 * (docs/specs/accountant-collections-20-signed-booked-line.md §3). `cleanupBookings` removes it with
 * the event.
 */
export async function addBookedLog(
  eventId: string,
  options: { userUuid: string; at: string },
): Promise<void> {
  const { error } = await admin().from("EventChangeLog").insert({
    event_uuid: eventId,
    changed_by_user_uuid: options.userUuid,
    field_name: "event_status",
    prev_value: "quoted",
    next_value: "booked",
    action_type: "status_change",
    changed_at: options.at,
  });
  if (error) throw new Error(`addBookedLog: ${error.message}`);
}

/**
 * A member of staff with a name, to be the manager of `addBookedLog`; `name` is written the way the
 * page writes it (first and last name, spaced). Any user the seed has will do.
 */
export async function aStaffMember(): Promise<{ id: string; name: string }> {
  const { data, error } = await admin()
    .from("Users")
    .select("id, first_name, last_name")
    .not("first_name", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`aStaffMember: no user with a name: ${error?.message}`);
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
  return { id: data.id as string, name };
}
