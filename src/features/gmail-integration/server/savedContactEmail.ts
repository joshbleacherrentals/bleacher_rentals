import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whether this email (a mailbox and Gmail's id for its copy there) was saved onto a contact. Reading
 * an email from Gmail is only for those: the page can only ask about an email it is showing, so
 * nothing else in a company mailbox is handed out because someone supplied its id.
 *
 * A contact is linked to one copy of an email, not to each mailbox's copy of it (see
 * planContactEmailSave), while a thread shows whichever copy it has. So the email counts as saved when
 * the copy asked about, or any other copy of the same email (the same Message-ID, in another
 * mailbox), is on a contact.
 *
 * Reads with the service-role client, so row-level security does not apply.
 */
export async function isSavedContactEmail(
  admin: SupabaseClient<any>,
  params: { mailbox: string; googleId: string },
): Promise<boolean> {
  const { data: email, error } = await admin
    .from("EmailMessages")
    .select("id, google_message_id")
    .eq("mailbox", params.mailbox)
    .eq("google_id", params.googleId)
    .maybeSingle();
  if (error) throw new Error(`Could not look the email up: ${error.message}`);
  if (!email) return false;

  const copyIds = new Set<string>([email.id]);
  if (email.google_message_id) {
    const { data: copies, error: copiesError } = await admin
      .from("EmailMessages")
      .select("id")
      .eq("google_message_id", email.google_message_id);
    if (copiesError) throw new Error(`Could not look the email up: ${copiesError.message}`);
    for (const copy of copies ?? []) copyIds.add(copy.id);
  }

  const { data: links, error: linkError } = await admin
    .from("ContactEmailMessages")
    .select("contact_uuid")
    .in("email_message_uuid", [...copyIds])
    .limit(1);
  if (linkError) throw new Error(`Could not look the email up: ${linkError.message}`);

  return (links?.length ?? 0) > 0;
}
