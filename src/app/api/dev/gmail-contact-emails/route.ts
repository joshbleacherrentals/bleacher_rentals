import { checkBlockedCustomerEmail } from "@/features/gmail-integration/server/blockedEmails";
import {
  clampLimit,
  isSafeSearchAddress,
  isValidDateBound,
  pullContactEmails,
} from "@/features/gmail-integration/server/contactEmails";
import {
  parseMailboxSourceParams,
  resolveDomainMailboxes,
} from "@/features/gmail-integration/server/domainMailboxes";
import { requireAdmin } from "@/features/userAccess/logic/requireAdmin";
import { createServiceRoleClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Development-only: every email involving an address, searched in every mailbox of a Workspace
 * domain (listed by Google's Directory API; see /api/dev/gmail-mailboxes) and merged. Nothing is
 * stored. The mailboxes come from the domain, never the request. 404 on any deployed build.
 *
 * An address at a company domain (bleacherrentals.com, tpi-3.ca), or on the BlockedCustomerEmails
 * list (the Blocked Emails page), is refused with a 403 before Google is asked anything, so a
 * colleague's mail cannot be read by adding them as a contact.
 *
 *   /api/dev/gmail-contact-emails?email=customer@xyz.com
 *     &limit=50             newest N per mailbox (1-500, default 50)
 *     &before=<seconds>     only older than this; use a mailbox's `nextBefore` to page back
 *     &after=2024/01/01     only newer than this (YYYY/MM/DD or epoch seconds)
 *     &domain=tpi-3.ca      search another domain than the configured one
 *     &source=users         list the mailboxes from the Users table instead of Google
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await requireAdmin();

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

    const parsed = parseMailboxSourceParams(params);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { mailboxes, ...searched } = await resolveDomainMailboxes(parsed);
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
    console.error("Gmail contact emails dev error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
