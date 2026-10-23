import {
  QboReadError,
  runTotalsCheck,
} from "@/features/quickbooks-integration/invoice/checkInvoiceTotals";
import { loadInvoiceSource } from "@/features/quickbooks-integration/invoice/loadInvoiceSource";
import { requireAdminOrAccountant } from "@/features/userAccess/logic/requireAdminOrAccountant";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { eventId }; anything else is refused. */
function parseEventId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { eventId } = body as Record<string, unknown>;
  return typeof eventId === "string" && UUID_RE.test(eventId) ? eventId : null;
}

// Compares the quote's QuickBooks invoice with the quote and stores the result as the quote's mismatch
// flag (docs/specs/qbo-invoice-06-totals-check.md §5). Admin and accountant, on a quote of any office.
// The invoice is read in the connection stored on the quote, not the office's current one.
export async function POST(req: NextRequest) {
  try {
    await requireAdminOrAccountant();

    const eventId = parseEventId(await req.json().catch(() => null));
    if (!eventId) {
      return NextResponse.json({ error: "Missing or invalid eventId" }, { status: 400 });
    }

    const source = await loadInvoiceSource(eventId, req.nextUrl.origin);
    if (!source) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (!source.qboInvoiceId) {
      return NextResponse.json(
        { error: "This quote has no QuickBooks invoice yet." },
        { status: 409 },
      );
    }

    let result;
    try {
      result = await runTotalsCheck(eventId, source);
    } catch (error) {
      // QuickBooks' side is a 502; anything else (the database) is the generic 500 below.
      if (error instanceof QboReadError) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
      throw error;
    }

    if (result.status === "missing") return NextResponse.json({ status: "invoice_missing" });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to check the QuickBooks invoice totals:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check the invoice" },
      { status: 500 },
    );
  }
}
