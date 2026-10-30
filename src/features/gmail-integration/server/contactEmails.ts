import "server-only";

import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { getDelegatedAccessToken, GMAIL_READONLY_SCOPE } from "./delegatedAuth";
import { getMessageSummary, listMessageIds, type GmailMessageSummary } from "./gmailMessages";

// Gmail only searches one mailbox at a time, so "everything involving this address" is the same
// search run in every mailbox, then merged. The search is cheap (it returns ids); fetching each
// match's headers is the expensive part, so each mailbox is capped and can be paged back in time.

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500; // the most messages.list returns in one page

const MAILBOX_CONCURRENCY = 5;
const MESSAGE_CONCURRENCY = 8;

/**
 * A conservative address shape for building a search from: the value goes straight into a Gmail
 * query, so it must not be able to carry search operators of its own.
 */
export function isSafeSearchAddress(address: string): boolean {
  return /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(address);
}

/** `after` / `before`: a date as YYYY/MM/DD, or epoch seconds (the precise form paging uses). */
export function isValidDateBound(value: string): boolean {
  return /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value) || /^\d{9,10}$/.test(value);
}

/** Gmail search for every message to, from, cc'd or bcc'd to `address`, optionally date-bounded. */
export function buildContactEmailQuery(
  address: string,
  bounds: { after?: string; before?: string } = {},
): string {
  const parts = [`{from:${address} to:${address} cc:${address} bcc:${address}}`];
  if (bounds.after) parts.push(`after:${bounds.after}`);
  if (bounds.before) parts.push(`before:${bounds.before}`);
  return parts.join(" ");
}

export function clampLimit(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export type MailboxResult = {
  mailbox: string;
  fetched: number;
  /** More matches exist further back than this page. */
  hasMore: boolean;
  /**
   * Pass as `before` to get the next, older page: the oldest fetched message's time in epoch
   * seconds, plus one so messages in that same second are not skipped (they dedupe by id).
   */
  nextBefore: number | null;
  error?: string;
};

export type ContactEmail = GmailMessageSummary & {
  /** "sent" when any mailbox's copy is in Sent, i.e. a colleague wrote it; otherwise "received". */
  direction: "sent" | "received";
  /** Every mailbox holding a copy, with that mailbox's Gmail id (needed to fetch the body later). */
  copies: { mailbox: string; id: string; threadId: string }[];
};

/**
 * Merges what each mailbox found into one list, newest first. The same email in several mailboxes
 * is one entry, recognised by its Message-ID header; without that header a copy stands alone.
 */
export function mergeMailboxMessages(
  perMailbox: { mailbox: string; messages: GmailMessageSummary[] }[],
): ContactEmail[] {
  const byKey = new Map<string, ContactEmail>();

  for (const { mailbox, messages } of perMailbox) {
    for (const message of messages) {
      const key = message.messageId?.trim().toLowerCase() || `${mailbox}:${message.id}`;
      const copy = { mailbox, id: message.id, threadId: message.threadId };
      const isSent = message.labelIds.includes("SENT");

      const existing = byKey.get(key);
      if (existing) {
        existing.copies.push(copy);
        if (isSent) existing.direction = "sent";
      } else {
        byKey.set(key, { ...message, direction: isSent ? "sent" : "received", copies: [copy] });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => (b.internalDate ?? 0) - (a.internalDate ?? 0));
}

async function searchMailbox(params: {
  mailbox: string;
  query: string;
  limit: number;
}): Promise<{ result: MailboxResult; messages: GmailMessageSummary[] }> {
  const { mailbox, query, limit } = params;
  try {
    const accessToken = await getDelegatedAccessToken({
      subject: mailbox,
      scopes: [GMAIL_READONLY_SCOPE],
    });
    const { ids, hasMore } = await listMessageIds(accessToken, query, limit);
    const messages = await mapWithConcurrency(ids, MESSAGE_CONCURRENCY, (id) =>
      getMessageSummary(accessToken, id),
    );

    const oldest = Math.min(...messages.map((m) => m.internalDate ?? Infinity));
    return {
      messages,
      result: {
        mailbox,
        fetched: messages.length,
        hasMore,
        nextBefore: hasMore && Number.isFinite(oldest) ? Math.floor(oldest / 1000) + 1 : null,
      },
    };
  } catch (error: any) {
    // One mailbox failing (not on the delegating domain, access revoked) must not sink the rest.
    return {
      messages: [],
      result: { mailbox, fetched: 0, hasMore: false, nextBefore: null, error: error.message },
    };
  }
}

/** Everything involving `address` across `mailboxes`, newest first, capped at `limit` per mailbox. */
export async function pullContactEmails(params: {
  address: string;
  mailboxes: string[];
  limit: number;
  after?: string;
  before?: string;
}): Promise<{ query: string; mailboxes: MailboxResult[]; messages: ContactEmail[] }> {
  const query = buildContactEmailQuery(params.address, params);

  const searched = await mapWithConcurrency(params.mailboxes, MAILBOX_CONCURRENCY, (mailbox) =>
    searchMailbox({ mailbox, query, limit: params.limit }),
  );

  return {
    query,
    mailboxes: searched.map((s) => s.result),
    messages: mergeMailboxMessages(
      searched.map((s) => ({ mailbox: s.result.mailbox, messages: s.messages })),
    ),
  };
}
