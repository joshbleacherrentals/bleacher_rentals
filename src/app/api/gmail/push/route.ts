import {
  isPermanentGmailFailure,
  supabaseSyncState,
} from "@/features/gmail-integration/server/mailboxSync";
import { parsePushBody, verifyPubSubPush } from "@/features/gmail-integration/server/pubsubAuth";
import { syncMailboxFromGmail } from "@/features/gmail-integration/server/syncRunner";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// A sync asks Google for a token, then Gmail, so give it room; Pub/Sub's own wait for an answer is
// the subscription's acknowledgement deadline, which should be set to match (60 seconds).
export const maxDuration = 60;

// Any 2xx tells Pub/Sub the notification is handled. Anything else, it sends again, later and later.
const handled = () => new NextResponse(null, { status: 204 });

/**
 * Where Gmail's push notifications arrive, through a Pub/Sub push subscription: Gmail publishes
 * `{ emailAddress, historyId }` to the topic whenever a watched mailbox changes (see
 * /api/cron/gmail-watch) and Pub/Sub POSTs it here. Open to the internet, so each request must carry
 * the subscription's signed token (see verifyPubSubPush). The notification only says which mailbox
 * changed: the sync asks Gmail what was added since the mailbox's saved place.
 *
 * Answers 204 when the notification is handled or can never be (not a notification, not a mailbox we
 * follow, Gmail refusing the mailbox for good), and 500 when trying again may work, so Pub/Sub does.
 * A repeated or late notification is harmless.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyPubSubPush(req);
  if (!auth.ok) {
    if (auth.status >= 500) console.error(`Gmail push: ${auth.reason}`);
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const note = parsePushBody(await req.json().catch(() => null));
  if (!note) {
    console.error("Gmail push: not a Gmail notification, so it was ignored.");
    return handled();
  }

  try {
    const admin = await createServiceRoleClient();
    // Only mailboxes we follow: a notification cannot make us read some other mailbox.
    if (!(await supabaseSyncState(admin).get(note.mailbox))) return handled();

    await syncMailboxFromGmail(admin, note.mailbox);
    return handled();
  } catch (error) {
    // The reason is already on the mailbox's row.
    if (isPermanentGmailFailure(error)) {
      console.error(`Gmail push: ${note.mailbox} cannot be synced, so it was not retried:`, error);
      return handled();
    }
    console.error(
      `Gmail push: syncing ${note.mailbox} failed, so Pub/Sub will send it again:`,
      error,
    );
    return NextResponse.json({ error: "The sync failed." }, { status: 500 });
  }
}
