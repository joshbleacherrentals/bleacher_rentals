import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import { saveEmailDetails } from "./loadEmailDetails";
import { saveContactEmails } from "./saveContactEmails";
import type { SentReply } from "./sendReply";

/**
 * Saves an email that was just sent to the contact's thread, body included, so opening it later
 * has nothing to load from Gmail. The row goes in the way a pulled email's does (saveContactEmails)
 * and its body the way a loaded one's does (saveEmailDetails). Does nothing when the server could
 * not read the email back, and saves no body when it sent none or the row already has one; a later
 * pull and a first open fill in whatever is missing.
 */
export async function saveSentEmail(contactUuid: string, sent: SentReply): Promise<void> {
  const { message, details } = sent;
  if (!message) return;

  await saveContactEmails(contactUuid, [message]);

  const copy = message.copies[0];
  if (!copy || (details?.text == null && details?.html == null)) return;

  // The row was just saved (or was already there); find it by the copy's mailbox and Gmail id.
  const [row] = await typedGetAll(
    db
      .selectFrom("EmailMessages")
      .select(["id", "email_message_details_uuid"])
      .where("mailbox", "=", copy.mailbox)
      .where("google_id", "=", copy.id)
      .compile(),
    expect<{ id: string; email_message_details_uuid: string | null }>(),
  );
  if (!row || row.email_message_details_uuid) return;

  await saveEmailDetails({
    emailMessageUuid: row.id,
    bodyText: details.text ?? null,
    bodyHtml: details.html ?? null,
  });
}
