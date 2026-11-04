import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch } from "@/lib/powersync/typedQuery";
import { buildPendingEmail, type PendingEmailInput } from "../logic/pendingEmail";

/**
 * Saves a reply the moment Send is pressed, as an email that is being sent (status 'sending'): its
 * row, its link to the contact and its body, in one local transaction, so it appears in the thread
 * and the contact's emails at once and is already complete to open. PowerSync uploads it; the
 * server sends the email and then fills in what only Gmail knows (see unsentEmail.ts). Returns the
 * new email's id, which the send request carries so the server knows which row it is.
 *
 * In upload order: the email, its link, its body, then the pointer to the body (the body refers to
 * the email, and the email's pointer refers to the body).
 */
export async function createPendingEmail(
  params: Omit<PendingEmailInput, "ids" | "now">,
): Promise<string> {
  const pending = buildPendingEmail({
    ...params,
    ids: {
      message: crypto.randomUUID(),
      link: crypto.randomUUID(),
      details: crypto.randomUUID(),
    },
    now: new Date().toISOString(),
  });

  await typedExecuteBatch([
    db.insertInto("EmailMessages").values(pending.message).compile(),
    db.insertInto("ContactEmailMessages").values(pending.link).compile(),
    db.insertInto("EmailMessageDetails").values(pending.details).compile(),
    db
      .updateTable("EmailMessages")
      .set({ email_message_details_uuid: pending.details.id })
      .where("id", "=", pending.message.id)
      .compile(),
  ]);

  return pending.message.id;
}
