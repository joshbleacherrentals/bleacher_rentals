import { checkBlockedCustomerEmail } from "@/features/gmail-integration/server/blockedEmails";
import {
  clampLimit,
  isSafeSearchAddress,
  isValidDateBound,
  pullContactEmails,
} from "@/features/gmail-integration/server/contactEmails";
import { resolveDomainMailboxes } from "@/features/gmail-integration/server/domainMailboxes";
import { requireContactEmailPuller } from "@/features/userAccess/logic/requireContactEmailAccess";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Every mailbox of the domain is searched, each as its own token, so give it room.
export const maxDuration = 120;

/**
 * Every email involving an address, searched in every mailbox of the company domain (listed by
 * Google's Directory API) and merged. This is what "Pull from Gmail" on a contact's Emails tab
 * asks; the page saves what comes back, this route stores nothing. The mailboxes come from the
 * domain, never the request.
 *
 * Who may call it: an admin, an account manager or an accountant (requireContactEmailPuller).
 *
 * An address at a company domain (bleacherrentals.com, tpi-3.ca), or on the BlockedCustomerEmails
 * list (the Blocked Emails page), is refused with a 403 before Google is asked anything, so a
 * colleague's mail cannot be read by adding them as a contact.
 *
 *   /api/gmail/contact-emails?email=customer@xyz.com
 *     &limit=50             newest N per mailbox (1-500, default 50)
 *     &before=<seconds>     only older than this; use a mailbox's `nextBefore` to page back
 *     &after=2024/01/01     only newer than this (YYYY/MM/DD or epoch seconds)
 */
export async function GET(req: NextRequest) {
  try {
    await requireContactEmailPuller();

    const params = req.nextUrl.searchParams;
    const address = params.get("email")?.trim() ?? "";
    if (!isSafeSearchAddress(address)) {
      return NextResponse.json({ error: "Pass a plain email address as ?email=" }, { status: 400 });
    }

    // Before anything is asked of Google, including the list of mailboxes.
    const blocked = await checkBlockedCustomerEmail(await createServiceRoleClient(), address);
    if (blocked.status === "blocked") {
      const error =
        blocked.reason === "company-domain"
          ? `${address} is a company address (${blocked.domain}), so its emails cannot be pulled from Gmail.`
          : `${address} is on the Blocked Emails list, so its emails cannot be pulled from Gmail.`;
      return NextResponse.json({ error }, { status: 403 });
    }
    if (blocked.status === "unreadable") {
      return NextResponse.json(
        { error: "Could not check the Blocked Emails list, so nothing was searched." },
        { status: 500 },
      );
    }

    const after = params.get("after") ?? undefined;
    const before = params.get("before") ?? undefined;
    for (const [name, value] of [
      ["after", after],
      ["before", before],
    ] as const) {
      if (value !== undefined && !isValidDateBound(value)) {
        return NextResponse.json(
          { error: `?${name}= must be YYYY/MM/DD or epoch seconds` },
          { status: 400 },
        );
      }
    }

    const { mailboxes, ...searched } = await resolveDomainMailboxes({ source: "directory" });
    if (mailboxes.length === 0) {
      throw new Error(`No mailboxes were found in ${searched.domain} to search`);
    }

    const result = await pullContactEmails({
      address,
      mailboxes,
      limit: clampLimit(params.get("limit")),
      after,
      before,
    });

    return NextResponse.json({
      address,
      ...searched,
      mailboxCount: mailboxes.length,
      unique: result.messages.length,
      ...result,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Gmail contact emails error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
