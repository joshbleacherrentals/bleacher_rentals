import "server-only";

import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import type { SyncOutcome, SyncState } from "./mailboxSync";

// Keeps every company mailbox watched and synced. Gmail pushes a mailbox's changes to Pub/Sub only
// while it is watched, and a watch lasts about a week, so this runs daily over the whole domain: a
// mailbox that was added since is given a row and a watch, every watch is renewed, and every mailbox
// is synced from its place, which also catches anything a push missed.

const MAILBOX_CONCURRENCY = 4;

export type RefreshOutcome = {
  mailbox: string;
  /** Whether Gmail was asked to push this mailbox's changes (only when there is a topic). */
  watched: boolean;
  /** Null for a mailbox that was only just started (its place is now), and when it failed. */
  sync: SyncOutcome | null;
  error?: string;
};

/** What a refresh does with Gmail and the database, so tests can stand in for them. */
export type RefreshDeps = {
  state: SyncState;
  getToken: (mailbox: string) => Promise<string>;
  watch: (accessToken: string, topic: string) => Promise<{ historyId: string; expiresAt: Date }>;
  sync: (mailbox: string, accessToken: string) => Promise<SyncOutcome>;
};

/**
 * Makes each mailbox's row if it has none, watches it (when `topic` is set: the Pub/Sub topic name,
 * `projects/<project>/topics/<topic>`), and syncs it. One mailbox failing (a suspended account, say)
 * is noted on its row and never stops the rest. A watch starts a mailbox with no place at the
 * watch's own history id, so there is nothing to catch up on; any other mailbox is synced.
 */
export async function refreshMailboxes(params: {
  mailboxes: string[];
  topic: string | null;
  deps: RefreshDeps;
}): Promise<RefreshOutcome[]> {
  const { topic, deps } = params;

  return mapWithConcurrency(params.mailboxes, MAILBOX_CONCURRENCY, async (mailbox) => {
    let watched = false;
    try {
      await deps.state.ensure(mailbox);
      const accessToken = await deps.getToken(mailbox);
      const row = await deps.state.get(mailbox);

      if (topic) {
        const watch = await deps.watch(accessToken, topic);
        await deps.state.update(mailbox, {
          watch_expires_at: watch.expiresAt.toISOString(),
          ...(row?.history_id ? {} : { history_id: watch.historyId }),
        });
        watched = true;
      }

      const justStarted = watched && !row?.history_id;
      const sync = justStarted ? null : await deps.sync(mailbox, accessToken);
      return { mailbox, watched, sync } satisfies RefreshOutcome;
    } catch (error: any) {
      const message = String(error?.message ?? error).slice(0, 1000);
      await deps.state.update(mailbox, { last_error: message }).catch(() => {});
      return { mailbox, watched, sync: null, error: message } satisfies RefreshOutcome;
    }
  });
}
