import { isSafeSearchAddress } from "@/features/gmail-integration/server/contactEmails";
import { getMailboxDomain } from "@/features/gmail-integration/server/mailboxes";
import { supabaseSyncState } from "@/features/gmail-integration/server/mailboxSync";
import { syncMailboxFromGmail } from "@/features/gmail-integration/server/syncRunner";
import { requireAdmin } from "@/features/userAccess/logic/requireAdmin";
import { mapWithConcurrency } from "@/lib/mapWithConcurrency";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const MAILBOX_CONCURRENCY = 3;

/**
 * An admin starts a sync by hand: the same sync a Gmail push or the daily job runs, for testing it
 * without Pub/Sub and for catching a mailbox up on the spot.
 *
 *   POST /api/gmail/sync { "mailbox": "paul@bleacherrentals.com" }   one mailbox
 *   POST /api/gmail/sync                                               every mailbox with a row
 *
 * A mailbox with no row yet is given one and starts from now, fetching nothing: sync it again after
 * an email has arrived. Only mailboxes of the configured domain are accepted.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => null);
    const admin = await createServiceRoleClient();

    if (typeof body?.mailbox === "string") {
      const mailbox = body.mailbox.trim().toLowerCase();
      if (!isSafeSearchAddress(mailbox) || !mailbox.endsWith(`@${getMailboxDomain()}`)) {
        return NextResponse.json(
          { error: `mailbox must be an address at ${getMailboxDomain()}.` },
          { status: 400 },
        );
      }
      const outcome = await syncMailboxFromGmail(admin, mailbox, { createRow: true });
      return NextResponse.json({ results: [outcome] });
    }

    const mailboxes = await supabaseSyncState(admin).list();
    const results = await mapWithConcurrency(mailboxes, MAILBOX_CONCURRENCY, async (mailbox) => {
      try {
        return await syncMailboxFromGmail(admin, mailbox);
      } catch (error: any) {
        return { mailbox, error: String(error?.message ?? error) };
      }
    });
    return NextResponse.json({ results });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Gmail sync error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
