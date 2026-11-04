import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { mergeMailboxMessages, type ContactEmail } from "./contactEmails";
import {
  getMessageSummary,
  getProfileHistoryId,
  GmailApiError,
  listHistory,
  listLatestMessages,
  type GmailHistoryPage,
  type GmailMessageSummary,
} from "./gmailMessages";
import type { SaveSyncedResult } from "./saveSyncedEmails";

// Keeps one mailbox's emails up to date. GmailMailboxSync remembers, per mailbox, the Gmail history
// id of the last change handled. A sync asks Gmail what was added since then, fetches those emails,
// and hands them to saveSyncedEmails, which saves the ones that involve a contact. Whatever starts
// it, a Pub/Sub push, the daily job or an admin, calls the same function, and running it again
// is harmless: what is saved is never saved twice.

/** Labels of emails that are not mail anyone sent or received (yet, or any more): never saved. */
const IGNORED_LABELS = ["DRAFT", "SPAM", "TRASH"];

const MAX_HISTORY_PAGES = 20;
const MESSAGE_CONCURRENCY = 8;
/** When Gmail no longer keeps the history, the latest emails are looked at instead. */
export const CATCH_UP_COUNT = 50;

/**
 * Whether a failed sync will fail the same way every time, so Pub/Sub should be told "got it" and
 * not asked to try again: Gmail refusing the request itself (a suspended account, no such
 * mailbox). A busy Gmail (408, 429), anything on Google's side (5xx) and anything else is worth
 * trying again.
 */
export function isPermanentGmailFailure(error: unknown): boolean {
  return (
    error instanceof GmailApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

export function keepAddedMessage(labelIds: readonly string[]): boolean {
  return !labelIds.some((label) => IGNORED_LABELS.includes(label));
}

/** Where a mailbox's place is kept. The real one is supabaseSyncState; tests use their own. */
export type SyncState = {
  /** The mailbox's row, or null if it has none. */
  get(mailbox: string): Promise<{ history_id: string | null } | null>;
  /** Makes the mailbox's row if it has none. */
  ensure(mailbox: string): Promise<void>;
  /** Every mailbox that has a row, in order. */
  list(): Promise<string[]>;
  update(
    mailbox: string,
    fields: {
      history_id?: string | null;
      watch_expires_at?: string | null;
      last_synced_at?: string;
      last_error?: string | null;
    },
  ): Promise<void>;
};

/** The Gmail calls a sync makes, so tests can stand in for them. */
export type SyncGmail = {
  listHistory: (
    accessToken: string,
    startHistoryId: string,
    pageToken?: string,
  ) => Promise<GmailHistoryPage>;
  getProfileHistoryId: (accessToken: string) => Promise<string>;
  getMessageSummary: (accessToken: string, id: string) => Promise<GmailMessageSummary>;
  listLatestMessages: (accessToken: string, count: number) => Promise<GmailMessageSummary[]>;
};

export const realSyncGmail: SyncGmail = {
  listHistory,
  getProfileHistoryId,
  getMessageSummary,
  listLatestMessages,
};

export type SyncOutcome = {
  mailbox: string;
  /**
   * "baselined": the mailbox had no place yet, so it now starts from this moment and nothing was
   * fetched. "synced": the changes since its place were handled. "caught-up": Gmail no longer
   * kept the history, so the latest emails were looked at instead.
   */
  status: "baselined" | "synced" | "caught-up";
  /** How many emails were fetched to look at. */
  fetched: number;
} & SaveSyncedResult;

const nothingSaved: SaveSyncedResult = { matched: 0, emailsAdded: 0, linksAdded: 0 };

/** Every email added to the mailbox since `startHistoryId`, and the history id to carry on from. */
async function collectAdded(
  gmail: SyncGmail,
  accessToken: string,
  startHistoryId: string,
): Promise<{ added: Map<string, string[]>; nextHistoryId: string }> {
  const added = new Map<string, string[]>();
  let pageToken: string | undefined;
  let last: GmailHistoryPage | null = null;

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    last = await gmail.listHistory(accessToken, startHistoryId, pageToken);
    // An email can be added more than once (a label added later): the latest labels are kept.
    for (const message of last.added) added.set(message.id, message.labelIds);
    if (!last.nextPageToken) break;
    pageToken = last.nextPageToken;
  }

  // Read every page: go on from where Gmail says the mailbox now is. Cut short: from the last
  // change handled, so the next sync picks up the rest.
  const finished = !last?.nextPageToken;
  const nextHistoryId = finished
    ? (last?.historyId ?? startHistoryId)
    : (last?.lastRecordId ?? startHistoryId);
  return { added, nextHistoryId };
}

/**
 * Brings one mailbox up to date and moves its place forward. `accessToken` acts as the mailbox
 * (readonly is enough). `save` is what is done with the emails fetched (saveSyncedEmails). The
 * place only moves once everything was saved, so a failure is simply tried again next time; the
 * reason is kept on the mailbox's row and the error thrown.
 */
export async function syncMailbox(params: {
  mailbox: string;
  accessToken: string;
  state: SyncState;
  save: (emails: ContactEmail[]) => Promise<SaveSyncedResult>;
  gmail?: SyncGmail;
  now?: () => Date;
}): Promise<SyncOutcome> {
  const { mailbox, accessToken, state, save } = params;
  const gmail = params.gmail ?? realSyncGmail;
  const now = params.now ?? (() => new Date());

  const row = await state.get(mailbox);
  if (!row) throw new Error(`${mailbox} is not a mailbox that is kept up to date.`);

  try {
    // No place yet: start from now. Older emails come from a contact's "Pull from Gmail".
    if (!row.history_id) {
      const historyId = await gmail.getProfileHistoryId(accessToken);
      await state.update(mailbox, {
        history_id: historyId,
        last_synced_at: now().toISOString(),
        last_error: null,
      });
      return { mailbox, status: "baselined", fetched: 0, ...nothingSaved };
    }

    let summaries: GmailMessageSummary[];
    let nextHistoryId: string;
    let status: "synced" | "caught-up" = "synced";

    try {
      const { added, nextHistoryId: next } = await collectAdded(gmail, accessToken, row.history_id);
      nextHistoryId = next;
      const ids = [...added].filter(([, labels]) => keepAddedMessage(labels)).map(([id]) => id);
      const fetched = await mapWithConcurrency(ids, MESSAGE_CONCURRENCY, async (id) => {
        try {
          return await gmail.getMessageSummary(accessToken, id);
        } catch (error) {
          // Gone since it was added (deleted, or moved out of reach): nothing to save.
          if (error instanceof GmailApiError && error.status === 404) return null;
          throw error;
        }
      });
      summaries = fetched.filter((summary): summary is GmailMessageSummary => summary !== null);
    } catch (error) {
      // Gmail only keeps about a week of history; before that it answers 404.
      if (!(error instanceof GmailApiError && error.status === 404)) throw error;

      // The place first, so an email arriving while the latest are listed is not lost.
      nextHistoryId = await gmail.getProfileHistoryId(accessToken);
      summaries = (await gmail.listLatestMessages(accessToken, CATCH_UP_COUNT)).filter((summary) =>
        keepAddedMessage(summary.labelIds),
      );
      status = "caught-up";
    }

    const emails = mergeMailboxMessages([{ mailbox, messages: summaries }]);
    const saved = emails.length > 0 ? await save(emails) : nothingSaved;

    await state.update(mailbox, {
      history_id: nextHistoryId,
      last_synced_at: now().toISOString(),
      last_error: null,
    });
    return { mailbox, status, fetched: summaries.length, ...saved };
  } catch (error: any) {
    // Best effort: failing to note the reason must not hide the real one.
    await state
      .update(mailbox, { last_error: String(error?.message ?? error).slice(0, 1000) })
      .catch(() => {});
    throw error;
  }
}

/** The state kept in the GmailMailboxSync table, through the service-role client. */
export function supabaseSyncState(admin: SupabaseClient<any>): SyncState {
  return {
    async get(mailbox) {
      const { data, error } = await admin
        .from("GmailMailboxSync")
        .select("history_id")
        .eq("mailbox", mailbox)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { history_id: string | null } | null;
    },

    async list() {
      const { data, error } = await admin
        .from("GmailMailboxSync")
        .select("mailbox")
        .order("mailbox");
      if (error) throw new Error(error.message);
      return (data as { mailbox: string }[]).map((row) => row.mailbox);
    },

    async ensure(mailbox) {
      const { error } = await admin
        .from("GmailMailboxSync")
        .upsert({ mailbox }, { onConflict: "mailbox", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },

    async update(mailbox, fields) {
      const { error } = await admin.from("GmailMailboxSync").update(fields).eq("mailbox", mailbox);
      if (error) throw new Error(error.message);
    },
  };
}
