import { watchMailbox } from "@/features/gmail-integration/server/gmailMessages";
import { resolveDomainMailboxes } from "@/features/gmail-integration/server/domainMailboxes";
import { supabaseSyncState } from "@/features/gmail-integration/server/mailboxSync";
import { refreshMailboxes } from "@/features/gmail-integration/server/mailboxWatch";
import {
  getMailboxToken,
  syncMailboxFromGmail,
} from "@/features/gmail-integration/server/syncRunner";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

/**
 * Daily (see vercel.json): keeps every mailbox of the domain watched and synced.
 *
 * The mailboxes are asked of Google's directory, so a new account is picked up without anyone
 * adding it. Each gets a GmailMailboxSync row, has its Gmail watch renewed (they last about a
 * week) when GMAIL_PUSH_TOPIC names the Pub/Sub topic, and is synced from its saved place, which
 * also catches anything a push missed. Without GMAIL_PUSH_TOPIC nothing is watched and the mailboxes
 * are only synced, so this alone keeps them up to date, a day behind at worst. Watching is left out
 * of every environment that does not set the topic on purpose: a mailbox has one watch for the whole
 * Cloud project, and a second environment watching it would take the first one's pushes.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { mailboxes } = await resolveDomainMailboxes({ source: "directory" });
    const admin = await createServiceRoleClient();
    const topic = process.env.GMAIL_PUSH_TOPIC?.trim() || null;

    const results = await refreshMailboxes({
      mailboxes,
      topic,
      deps: {
        state: supabaseSyncState(admin),
        getToken: getMailboxToken,
        watch: watchMailbox,
        sync: (mailbox, accessToken) => syncMailboxFromGmail(admin, mailbox, { accessToken }),
      },
    });

    return NextResponse.json({
      watching: topic !== null,
      mailboxes: results.length,
      failed: results.filter((result) => result.error).length,
      results,
    });
  } catch (error: any) {
    console.error("Gmail watch cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
