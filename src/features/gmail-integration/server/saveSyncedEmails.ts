import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAddressList } from "@/features/companiesContacts/logic/emailActivity";
import {
  copyKey,
  planContactEmailSave,
  type EmailMessageRow,
  type LinkRow,
} from "@/features/companiesContacts/logic/planContactEmailSave";
import { companyDomainOf, type BlockedCheck } from "./blockedEmails";
import { isSafeSearchAddress, type ContactEmail } from "./contactEmails";

// Saves the emails a mailbox has just received or sent, on the server, for whichever contacts they
// involve. The contact page's pull starts from a contact and searches every mailbox for them; this
// starts from a mailbox's new emails and finds the contacts, but the rules are the pull's: nothing
// is saved for an address at a company domain or on the Blocked Emails list, an email in several
// mailboxes is several rows (one per mailbox copy) and a contact is linked to it once, and what is
// already saved is never saved twice. The deciding is planContactEmailSave, shared with the browser.

const CONTACT_LOOKUP_CHUNK = 25;
const LOOKUP_CHUNK = 100;
const INSERT_CHUNK = 100;

/** A saved copy of an email: the facts needed to tell which emails are already in the database. */
export type KnownCopy = {
  id: string;
  mailbox: string;
  google_id: string;
  google_thread_id: string | null;
  google_message_id: string | null;
};

/** Where the saving reads and writes. The real one is supabaseEmailStore; tests use their own. */
export type EmailStore = {
  /** The contacts, not deleted, whose email is any of these lowercase addresses. */
  findContacts(addresses: string[]): Promise<{ id: string; email: string }[]>;
  /** Saved copies that have one of these Message-IDs, or one of these Gmail ids in `mailbox`. */
  findCopies(params: {
    mailbox: string;
    googleIds: string[];
    messageIds: string[];
  }): Promise<KnownCopy[]>;
  /** Of these EmailMessages ids, the ones the contact is linked to. */
  findLinkedIds(contactUuid: string, emailIds: string[]): Promise<Set<string>>;
  insertEmails(rows: EmailMessageRow[]): Promise<void>;
  insertLinks(rows: LinkRow[]): Promise<void>;
};

export type SaveSyncedResult = {
  /** How many of the emails involved at least one contact that may be saved for. */
  matched: number;
  emailsAdded: number;
  linksAdded: number;
};

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The outside addresses an email names: its From, To and Cc, lowercased, once each. Addresses at a
 * company domain are left out (they are colleagues, never a contact to save for) and so is anything
 * that is not a plain address. Bcc is not known: Gmail does not hand it over with the headers.
 */
export function outsideAddresses(email: Pick<ContactEmail, "from" | "to" | "cc">): string[] {
  const found = [email.from, email.to, email.cc].flatMap((header) =>
    parseAddressList(header).map((person) => person.address.trim().toLowerCase()),
  );
  return [...new Set(found)].filter(
    (address) => isSafeSearchAddress(address) && companyDomainOf(address) === null,
  );
}

/**
 * Saves `emails` (the new emails of `mailbox`, one copy each, as mergeMailboxMessages gives them)
 * for every contact they involve. Throws when the Blocked Emails list cannot be read, saving
 * nothing, because a broken list must never let everything through.
 */
export async function saveSyncedEmails(params: {
  store: EmailStore;
  /** Whether a contact's address may be saved for (see checkBlockedCustomerEmail). */
  isBlocked: (address: string) => Promise<BlockedCheck>;
  mailbox: string;
  emails: ContactEmail[];
  now: string;
  newId: () => string;
}): Promise<SaveSyncedResult> {
  const { store, mailbox } = params;
  const none: SaveSyncedResult = { matched: 0, emailsAdded: 0, linksAdded: 0 };

  // Which contacts each email involves.
  const participants = params.emails.map((email) => outsideAddresses(email));
  const candidates = [...new Set(participants.flat())];
  if (candidates.length === 0) return none;

  const found: { id: string; email: string }[] = [];
  for (const part of chunks(candidates, CONTACT_LOOKUP_CHUNK)) {
    found.push(...(await store.findContacts(part)));
  }
  // The lookup may over-fetch (a _ in an address is a wildcard to the database): keep exact matches.
  const wanted = new Set(candidates);
  const contactsByAddress = new Map<string, string[]>();
  for (const contact of found) {
    const address = contact.email.trim().toLowerCase();
    if (!wanted.has(address)) continue;
    contactsByAddress.set(address, [...(contactsByAddress.get(address) ?? []), contact.id]);
  }

  // Of those, only the addresses that may be saved for.
  const allowed = new Set<string>();
  for (const address of contactsByAddress.keys()) {
    const check = await params.isBlocked(address);
    if (check.status === "unreadable") {
      throw new Error(`Could not check the Blocked Emails list: ${check.message}`);
    }
    if (check.status === "allowed") allowed.add(address);
  }

  // Each email with the contacts it involves; the rest are not ours to save.
  const involved = params.emails
    .map((email, i) => ({
      email,
      contactIds: [
        ...new Set(
          participants[i].filter((a) => allowed.has(a)).flatMap((a) => contactsByAddress.get(a)!),
        ),
      ],
    }))
    .filter((entry) => entry.contactIds.length > 0 && entry.email.copies.length > 0);
  if (involved.length === 0) return none;

  // What is saved already: this mailbox's copies by Gmail id, and every copy, in any mailbox, of
  // these emails by Message-ID.
  const messageIds = [
    ...new Set(involved.map((e) => e.email.messageId?.trim()).filter((id): id is string => !!id)),
  ];
  const googleIds = involved.flatMap((e) => e.email.copies.map((c) => c.id));
  const known = new Map<string, KnownCopy>();
  for (const part of chunks(googleIds, LOOKUP_CHUNK)) {
    for (const copy of await store.findCopies({ mailbox, googleIds: part, messageIds: [] })) {
      known.set(copy.id, copy);
    }
  }
  for (const part of chunks(messageIds, LOOKUP_CHUNK)) {
    for (const copy of await store.findCopies({ mailbox, googleIds: [], messageIds: part })) {
      known.set(copy.id, copy);
    }
  }
  const savedCopies = new Map<string, string>(
    [...known.values()].map((copy) => [copyKey(copy.mailbox, copy.google_id), copy.id]),
  );

  // The same email in another mailbox is the same email: its other copies join this one's, so a
  // contact already linked to any of them is not linked a second time.
  const withCopies = involved.map(({ email, contactIds }) => {
    const key = email.messageId?.trim().toLowerCase();
    const others = key
      ? [...known.values()].filter(
          (copy) =>
            copy.google_message_id?.trim().toLowerCase() === key &&
            !(copy.mailbox === mailbox && email.copies.some((c) => c.id === copy.google_id)),
        )
      : [];
    return {
      contactIds,
      email: {
        ...email,
        copies: [
          ...email.copies,
          ...others.map((c) => ({
            mailbox: c.mailbox,
            id: c.google_id,
            threadId: c.google_thread_id ?? "",
          })),
        ],
      },
    };
  });

  const newEmails: EmailMessageRow[] = [];
  const newLinks: LinkRow[] = [];
  const contactIds = [...new Set(withCopies.flatMap((e) => e.contactIds))];
  for (const contactUuid of contactIds) {
    const mine = withCopies.filter((e) => e.contactIds.includes(contactUuid)).map((e) => e.email);

    const linkedIds = new Set<string>();
    for (const part of chunks([...savedCopies.values()], LOOKUP_CHUNK)) {
      for (const id of await store.findLinkedIds(contactUuid, part)) linkedIds.add(id);
    }

    const plan = planContactEmailSave({
      contactUuid,
      emails: mine,
      savedCopies,
      linkedIds,
      now: params.now,
      newId: params.newId,
    });
    // The next contact finds these as saved, so one email is one row however many contacts it has.
    for (const row of plan.newEmails) savedCopies.set(copyKey(row.mailbox, row.google_id), row.id);
    newEmails.push(...plan.newEmails);
    newLinks.push(...plan.newLinks);
  }

  // Emails before links, since a link points at an email.
  for (const part of chunks(newEmails, INSERT_CHUNK)) await store.insertEmails(part);
  for (const part of chunks(newLinks, INSERT_CHUNK)) await store.insertLinks(part);

  return { matched: involved.length, emailsAdded: newEmails.length, linksAdded: newLinks.length };
}

/** The store for the real database, through the service-role client (row-level security off). */
export function supabaseEmailStore(admin: SupabaseClient<any>): EmailStore {
  const check = <T>(result: { data: T | null; error: { message: string } | null }): T => {
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []) as T;
  };

  return {
    async findContacts(addresses) {
      // ilike so a contact saved as Pat@XYZ.com is found; the caller keeps only exact matches.
      const filter = addresses.map((address) => `email.ilike.${address}`).join(",");
      const rows = check(
        await admin.from("Contacts").select("id, email").eq("deleted", false).or(filter),
      ) as { id: string; email: string | null }[];
      return rows.filter((row): row is { id: string; email: string } => !!row.email);
    },

    async findCopies({ mailbox, googleIds, messageIds }) {
      const columns = "id, mailbox, google_id, google_thread_id, google_message_id";
      const rows: KnownCopy[] = [];
      if (messageIds.length > 0) {
        rows.push(
          ...(check(
            await admin.from("EmailMessages").select(columns).in("google_message_id", messageIds),
          ) as KnownCopy[]),
        );
      }
      if (googleIds.length > 0) {
        rows.push(
          ...(check(
            await admin
              .from("EmailMessages")
              .select(columns)
              .eq("mailbox", mailbox)
              .in("google_id", googleIds),
          ) as KnownCopy[]),
        );
      }
      return rows.filter((row) => row.google_id);
    },

    async findLinkedIds(contactUuid, emailIds) {
      const rows = check(
        await admin
          .from("ContactEmailMessages")
          .select("email_message_uuid")
          .eq("contact_uuid", contactUuid)
          .in("email_message_uuid", emailIds),
      ) as { email_message_uuid: string }[];
      return new Set(rows.map((row) => row.email_message_uuid));
    },

    // Upserts that skip what is there, so saving the same email twice (a repeated notification)
    // is harmless.
    async insertEmails(rows) {
      check(
        await admin
          .from("EmailMessages")
          .upsert(rows, { onConflict: "mailbox,google_id", ignoreDuplicates: true }),
      );
    },

    async insertLinks(rows) {
      check(
        await admin
          .from("ContactEmailMessages")
          .upsert(rows, { onConflict: "contact_uuid,email_message_uuid", ignoreDuplicates: true }),
      );
    },
  };
}
