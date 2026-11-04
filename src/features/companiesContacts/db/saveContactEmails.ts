import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecuteBatch, typedGetAll } from "@/lib/powersync/typedQuery";
import type { PulledEmail } from "../logic/emailActivity";
import { copyKey, planContactEmailSave } from "../logic/planContactEmailSave";

// The planning itself is shared with the server; these names stay importable from here.
export { copyKey, planContactEmailSave } from "../logic/planContactEmailSave";

// Looking up and inserting in chunks keeps each statement under SQLite's bound-parameter limit.
const LOOKUP_CHUNK = 400;
const EMAIL_INSERT_CHUNK = 50; // 15 columns each
const LINK_INSERT_CHUNK = 100; // 4 columns each

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Saves the emails pulled from Gmail for a contact into the local database (PowerSync uploads them),
 * in one transaction: a row for every mailbox copy not seen before, and one link from this contact to
 * each email. Pulling the same emails again saves nothing twice. `added` is how many emails are new
 * to this contact.
 */
export async function saveContactEmails(
  contactUuid: string,
  emails: PulledEmail[],
): Promise<{ added: number; copiesAdded: number }> {
  if (emails.length === 0) return { added: 0, copiesAdded: 0 };

  // Which of these copies are already saved? Looked up by Gmail id, then matched on mailbox too.
  const googleIds = [...new Set(emails.flatMap((e) => e.copies.map((c) => c.id)))];
  const savedCopies = new Map<string, string>();
  for (const part of chunks(googleIds, LOOKUP_CHUNK)) {
    const rows = await typedGetAll(
      db
        .selectFrom("EmailMessages")
        .select(["id", "mailbox", "google_id"])
        .where("google_id", "in", part)
        .compile(),
      expect<{ id: string; mailbox: string | null; google_id: string | null }>(),
    );
    for (const row of rows) {
      if (row.mailbox && row.google_id)
        savedCopies.set(copyKey(row.mailbox, row.google_id), row.id);
    }
  }

  // Which of those saved rows is this contact already linked to?
  const linkedIds = new Set<string>();
  for (const part of chunks([...savedCopies.values()], LOOKUP_CHUNK)) {
    const rows = await typedGetAll(
      db
        .selectFrom("ContactEmailMessages")
        .select(["email_message_uuid"])
        .where("contact_uuid", "=", contactUuid)
        .where("email_message_uuid", "in", part)
        .compile(),
      expect<{ email_message_uuid: string | null }>(),
    );
    for (const row of rows) if (row.email_message_uuid) linkedIds.add(row.email_message_uuid);
  }

  const { newEmails, newLinks } = planContactEmailSave({
    contactUuid,
    emails,
    savedCopies,
    linkedIds,
    now: new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  });

  // Emails before links, in one transaction: either everything is saved or nothing is.
  await typedExecuteBatch([
    ...chunks(newEmails, EMAIL_INSERT_CHUNK).map((rows) =>
      db.insertInto("EmailMessages").values(rows).compile(),
    ),
    ...chunks(newLinks, LINK_INSERT_CHUNK).map((rows) =>
      db.insertInto("ContactEmailMessages").values(rows).compile(),
    ),
  ]);

  return { added: newLinks.length, copiesAdded: newEmails.length };
}
