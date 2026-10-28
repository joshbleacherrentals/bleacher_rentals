import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecuteBatch, typedGetAll } from "@/lib/powersync/typedQuery";
import { pulledEmailDate, type PulledEmail } from "../logic/emailActivity";

// Looking up and inserting in chunks keeps each statement under SQLite's bound-parameter limit.
const LOOKUP_CHUNK = 400;
const EMAIL_INSERT_CHUNK = 50; // 13 columns each
const LINK_INSERT_CHUNK = 100; // 4 columns each

type EmailMessageRow = {
  id: string;
  created_at: string;
  mailbox: string;
  google_message_id: string | null;
  google_id: string;
  google_thread_id: string;
  from_address: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  direction: "sent" | "received";
};

type LinkRow = {
  id: string;
  created_at: string;
  contact_uuid: string;
  email_message_uuid: string;
};

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A copy is identified by its mailbox and Gmail id together: a Gmail id is only unique within one mailbox. */
export const copyKey = (mailbox: string, googleId: string) => `${mailbox}|${googleId}`;

/**
 * Decides what to write for a pull. Every mailbox copy of an email becomes its own EmailMessages row
 * (so its body can be fetched later as that mailbox); a copy that is already saved is reused. The
 * contact is linked once per email, to its primary (first) copy. Pure, so the rules can be tested
 * without a database.
 */
export function planContactEmailSave(params: {
  contactUuid: string;
  emails: PulledEmail[];
  /** Saved EmailMessages ids, by copyKey(mailbox, google_id). */
  savedCopies: ReadonlyMap<string, string>;
  /** EmailMessages ids this contact is already linked to. */
  linkedIds: ReadonlySet<string>;
  now: string;
  newId: () => string;
}): { newEmails: EmailMessageRow[]; newLinks: LinkRow[]; copiesAlreadySaved: number } {
  const newEmails: EmailMessageRow[] = [];
  const newLinks: LinkRow[] = [];
  const seen = new Set<string>();
  let copiesAlreadySaved = 0;

  for (const email of params.emails) {
    if (email.copies.length === 0) continue;

    const messageId = email.messageId?.trim() || null;
    const first = email.copies[0];
    const key = messageId ?? copyKey(first.mailbox, first.id);
    if (seen.has(key)) continue;
    seen.add(key);

    const rowIds: string[] = [];
    for (const copy of email.copies) {
      const savedId = params.savedCopies.get(copyKey(copy.mailbox, copy.id));
      if (savedId) {
        copiesAlreadySaved++;
        rowIds.push(savedId);
        continue;
      }

      const id = params.newId();
      rowIds.push(id);
      newEmails.push({
        id,
        created_at: params.now,
        mailbox: copy.mailbox,
        google_message_id: messageId,
        google_id: copy.id,
        google_thread_id: copy.threadId,
        from_address: email.from,
        to_addresses: email.to,
        cc_addresses: email.cc,
        subject: email.subject,
        date: pulledEmailDate(email),
        snippet: email.snippet,
        direction: email.direction,
      });
    }

    // Linked to any copy already? Then this contact has the email.
    if (!rowIds.some((id) => params.linkedIds.has(id))) {
      newLinks.push({
        id: params.newId(),
        created_at: params.now,
        contact_uuid: params.contactUuid,
        email_message_uuid: rowIds[0],
      });
    }
  }

  return { newEmails, newLinks, copiesAlreadySaved };
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
