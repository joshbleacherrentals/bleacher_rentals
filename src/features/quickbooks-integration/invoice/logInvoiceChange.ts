import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";

/**
 * Writes the invoice app's changes to the quote's Log (EventChangeLog) with the service role: the
 * route runs for an accountant, whom the Events guard and the Log's policies do not let write these.
 * Spec: docs/specs/qbo-invoice-04-create.md §6
 */

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const KIND_LABELS = { created: "Created" } as const;

/** "None" → "Created (invoice {docNumber})", shown under the label of `qbo_invoice`. */
export async function logInvoiceChange(params: {
  eventId: string;
  userUuid: string;
  kind: keyof typeof KIND_LABELS;
  docNumber: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("EventChangeLog")
    .insert({
      event_uuid: params.eventId,
      changed_by_user_uuid: params.userUuid,
      field_name: "qbo_invoice",
      prev_value: "None",
      next_value: `${KIND_LABELS[params.kind]} (invoice ${params.docNumber})`,
      action_type: "update",
      changed_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Failed to write the invoice to the Log: ${error.message}`);
}

/** The row setEventIsQbo writes when the QuickBooks Invoice box goes from No to Yes. */
export async function logIsQboSet(params: { eventId: string; userUuid: string }): Promise<void> {
  const { error } = await getSupabaseAdmin().from("EventChangeLog").insert({
    event_uuid: params.eventId,
    changed_by_user_uuid: params.userUuid,
    field_name: "is_qbo",
    prev_value: "No",
    next_value: "Yes",
    action_type: "update",
    changed_at: new Date().toISOString(),
  });
  if (error)
    throw new Error(`Failed to write the QuickBooks Invoice box to the Log: ${error.message}`);
}
