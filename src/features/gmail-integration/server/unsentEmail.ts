import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pulledEmailDate,
  type PulledEmail,
} from "@/features/companiesContacts/logic/emailActivity";

// The server's half of sending a reply. When Send is pressed the page saves the reply at once as an
// EmailMessages row with status 'sending' (see createPendingEmail), then asks the route to send it.
// Everything here uses the service-role client, so row-level security does not apply: the checks
// are made here, against the row itself. A signed-in user cannot do this part for themselves: only
// the server can mark an email 'success' or give it Google's ids.

type Admin = SupabaseClient<any>;

/** How long to wait for a row the page has saved but its device has not uploaded yet. */
export const ROW_WAIT = { totalMs: 8000, everyMs: 300 };

export type UnsentEmailRow = {
  id: string;
  mailbox: string;
  direction: string;
  status: string;
  google_id: string | null;
};

const COLUMNS = "id, mailbox, direction, status, google_id";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What Gmail knows about a sent email, as the columns of its EmailMessages row. */
export function sentEmailColumns(email: PulledEmail) {
  const copy = email.copies[0];
  return {
    google_message_id: email.messageId?.trim() || null,
    google_id: copy.id,
    google_thread_id: copy.threadId,
    google_in_reply_to: email.inReplyTo?.trim() || null,
    google_references: email.references?.trim() || null,
    from_address: email.from,
    to_addresses: email.to,
    cc_addresses: email.cc,
    subject: email.subject,
    date: pulledEmailDate(email),
    snippet: email.snippet,
  };
}

/**
 * Why this row is not `sender`'s email still to be sent, or null when it is: in their mailbox, one
 * they wrote (not received), still 'sending' and with no Google id yet. Tells a second request for
 * an email that is already sent apart from a first.
 */
export function checkOwnUnsentEmail(row: UnsentEmailRow, sender: string): string | null {
  if (row.mailbox.toLowerCase() !== sender.toLowerCase() || row.direction !== "sent") {
    return "That email is not yours to send.";
  }
  if (row.status === "success" || row.google_id) return "That email was already sent.";
  if (row.status !== "sending") return "That email is not waiting to be sent.";
  return null;
}

/**
 * The row for `id`, or null if there is none. The page saves a reply on the device and uploads it
 * in the background, so a request can arrive first: with `wait`, looks again every `everyMs` until
 * `totalMs` has passed.
 */
export async function findEmailRow(
  admin: Admin,
  id: string,
  wait: { totalMs: number; everyMs: number } = { totalMs: 0, everyMs: 300 },
  sleep: (ms: number) => Promise<void> = delay,
): Promise<UnsentEmailRow | null> {
  const attempts = Math.floor(wait.totalMs / wait.everyMs);
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await admin
      .from("EmailMessages")
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as UnsentEmailRow;
    if (attempt >= attempts) return null;
    await sleep(wait.everyMs);
  }
}

/**
 * Marks the email as sent and fills in what only Gmail knows (`columns`, see sentEmailColumns; a
 * bare `google_id` and `google_thread_id` at the least). Only `sender`'s own email still 'sending'
 * is touched. Returns "missing" when there was no such row to update (it never arrived, or is not
 * theirs, or is not waiting), and "duplicate" when a pull from Gmail had already saved this very
 * email as another row: then the pending row is dropped, since the pulled one is the email.
 */
export async function recordSentEmail(
  admin: Admin,
  params: {
    id: string;
    sender: string;
    columns: Record<string, unknown>;
    wait?: { totalMs: number; everyMs: number };
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<"updated" | "duplicate" | "missing"> {
  const row = await findEmailRow(admin, params.id, params.wait, params.sleep);
  if (!row || checkOwnUnsentEmail(row, params.sender) !== null) return "missing";

  const { data, error } = await admin
    .from("EmailMessages")
    .update({ ...params.columns, status: "success", error_text: null })
    .eq("id", params.id)
    .eq("mailbox", row.mailbox)
    .eq("status", "sending")
    .select("id");

  // Another row already has this mailbox and Gmail id: the pull got there first.
  if (error?.code === "23505") {
    await admin.from("EmailMessages").delete().eq("id", params.id).eq("status", "sending");
    return "duplicate";
  }
  if (error) throw error;
  return data && data.length > 0 ? "updated" : "missing";
}

/**
 * Marks `sender`'s email as failed, with the reason to show on it. Only an email still 'sending'
 * that is theirs changes. Resolves quietly when there is no such row.
 */
export async function recordFailedEmail(
  admin: Admin,
  params: {
    id: string;
    sender: string;
    reason: string;
    wait?: { totalMs: number; everyMs: number };
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<void> {
  const row = await findEmailRow(admin, params.id, params.wait, params.sleep);
  if (!row || checkOwnUnsentEmail(row, params.sender) !== null) return;

  const { error } = await admin
    .from("EmailMessages")
    .update({ status: "error", error_text: params.reason.slice(0, 1000) })
    .eq("id", params.id)
    .eq("mailbox", row.mailbox)
    .eq("status", "sending");
  if (error) throw error;
}
