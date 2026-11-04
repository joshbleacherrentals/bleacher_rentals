import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkBlockedCustomerEmail, type BlockedCheck } from "./blockedEmails";
import { getDelegatedAccessToken, GMAIL_READONLY_SCOPE } from "./delegatedAuth";
import { supabaseSyncState, syncMailbox, type SyncOutcome } from "./mailboxSync";
import { saveSyncedEmails, supabaseEmailStore } from "./saveSyncedEmails";

/**
 * The Blocked Emails check, remembering its answers for as long as it is used: a sync looks at the
 * same few contact addresses again and again, and each check reads the whole list.
 */
export function cachedBlockedCheck(admin: SupabaseClient<any>) {
  const answers = new Map<string, Promise<BlockedCheck>>();
  return (address: string): Promise<BlockedCheck> => {
    let answer = answers.get(address);
    if (!answer) {
      answer = checkBlockedCustomerEmail(admin, address);
      answers.set(address, answer);
    }
    return answer;
  };
}

/** A token that acts as `mailbox` with read access: what both watching and syncing need. */
export function getMailboxToken(mailbox: string): Promise<string> {
  return getDelegatedAccessToken({ subject: mailbox, scopes: [GMAIL_READONLY_SCOPE] });
}

/**
 * Brings a mailbox up to date from Gmail, for real: its place is kept in GmailMailboxSync, the
 * emails that involve a contact are saved to Supabase (see saveSyncedEmails). Pass `accessToken`
 * when one is already in hand. A mailbox with no row yet is given one first, and starts from now.
 */
export async function syncMailboxFromGmail(
  admin: SupabaseClient<any>,
  mailbox: string,
  options: { accessToken?: string; createRow?: boolean } = {},
): Promise<SyncOutcome> {
  const state = supabaseSyncState(admin);
  if (options.createRow) await state.ensure(mailbox);

  const store = supabaseEmailStore(admin);
  const isBlocked = cachedBlockedCheck(admin);

  return syncMailbox({
    mailbox,
    accessToken: options.accessToken ?? (await getMailboxToken(mailbox)),
    state,
    save: (emails) =>
      saveSyncedEmails({
        store,
        isBlocked,
        mailbox,
        emails,
        now: new Date().toISOString(),
        newId: () => crypto.randomUUID(),
      }),
  });
}
