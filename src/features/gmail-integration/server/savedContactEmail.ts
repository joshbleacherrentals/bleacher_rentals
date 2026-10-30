import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether this copy of an email (a mailbox and Gmail's id for it) is one that was saved onto a
 * contact. Reading an email from Gmail is only for those: the page can only ask about an email it
 * is showing, so nothing else in a company mailbox is handed out because someone supplied its id.
 *
 * Reads with the service-role client, so row-level security does not apply.
 */
export async function isSavedContactEmail(
  admin: SupabaseClient<any>,
  params: { mailbox: string; googleId: string },
): Promise<boolean> {
  const { data: email, error } = await admin
    .from("EmailMessages")
    .select("id")
    .eq("mailbox", params.mailbox)
    .eq("google_id", params.googleId)
    .maybeSingle();
  if (error) throw new Error(`Could not look the email up: ${error.message}`);
  if (!email) return false;

  const { data: links, error: linkError } = await admin
    .from("ContactEmailMessages")
    .select("contact_uuid")
    .eq("email_message_uuid", email.id)
    .limit(1);
  if (linkError) throw new Error(`Could not look the email up: ${linkError.message}`);

  return (links?.length ?? 0) > 0;
}
