import { pulledEmailDate, type PulledEmail } from "./emailActivity";

// What saving the emails pulled for a contact comes down to, with no database in it: which rows are
// new, and which contact links are missing. The browser (saveContactEmails.ts, into the local
// database) and the server (saveSyncedEmails.ts, into Supabase) both make the same decisions, so
// they share this.

export type EmailMessageRow = {
  id: string;
  created_at: string;
  mailbox: string;
  google_message_id: string | null;
  google_id: string;
  google_thread_id: string;
  google_in_reply_to: string | null;
  google_references: string | null;
  from_address: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  direction: "sent" | "received";
};

export type LinkRow = {
  id: string;
  created_at: string;
  contact_uuid: string;
  email_message_uuid: string;
};

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
        google_in_reply_to: email.inReplyTo?.trim() || null,
        google_references: email.references?.trim() || null,
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
