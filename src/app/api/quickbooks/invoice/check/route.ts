import {
  QboReadError,
  runInvoiceCheck,
} from "@/features/quickbooks-integration/invoice/checkInvoice";
import { loadInvoiceSource } from "@/features/quickbooks-integration/invoice/loadInvoiceSource";
import { canAccessPath } from "@/features/userAccess/accessConfig";
import { hasAdminOrAccountantRole } from "@/features/userAccess/logic/hasAdminOrAccountantRole";
import { resolveUserAccessForRequest } from "@/features/userAccess/logic/resolveUserAccessForRequest";
import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { eventId }; anything else is refused. */
function parseEventId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { eventId } = body as Record<string, unknown>;
  return typeof eventId === "string" && UUID_RE.test(eventId) ? eventId : null;
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

// Compares the quote's QuickBooks invoice with the quote and stores the result as the quote's mismatch
// flag, its reasons and the time of the check (docs/specs/qbo-invoice-06-totals-check.md §6). Called by
// Check again and after a quote is saved, so any role that may open the quote card may call it, as
// long as its own token can read the quote (docs/specs/qbo-invoice-06a-check-on-save.md §3). An admin
// and an accountant get the whole answer; anyone else gets the status only. The invoice is read in
// the connection stored on the quote, not the office's current one.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const access = await resolveUserAccessForRequest(userId);
    if (access.status !== "active" || !canAccessPath(access.roles, "/quotes-bookings")) {
      return json({ error: "Forbidden" }, 403);
    }

    const eventId = parseEventId(await req.json().catch(() => null));
    if (!eventId) return json({ error: "Missing or invalid eventId" }, 400);

    // The caller's own token, so row-level security decides whether they can see the quote at all.
    const { data: visible, error: visibleError } = await createServerSupabaseClient()
      .from("Events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    if (visibleError) throw new Error(`Failed to read the quote: ${visibleError.message}`);
    if (!visible) return json({ error: "Quote not found." }, 404);

    const source = await loadInvoiceSource(eventId, req.nextUrl.origin);
    if (!source) return json({ error: "Quote not found." }, 404);
    if (!source.qboInvoiceId) {
      return json({ error: "This quote has no QuickBooks invoice yet." }, 409);
    }

    let result;
    try {
      result = await runInvoiceCheck(eventId, source);
    } catch (error) {
      // QuickBooks' side is a 502; anything else (the database) is the generic 500 below.
      if (error instanceof QboReadError) return json({ error: error.message }, 502);
      throw error;
    }

    if (result.status === "missing") return json({ status: "invoice_missing" });
    if (result.status === "skipped") return json({ status: "skipped", message: result.message });
    // The check has stored its answer; someone who is not an accountant is not shown the invoice.
    if (!hasAdminOrAccountantRole(access.roles)) return json({ status: "checked" });
    return json(result);
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to check the QuickBooks invoice:", error);
    return json({ error: error.message || "Failed to check the invoice" }, 500);
  }
}
