import { getSupabaseAdmin } from "@/features/quickbooks-integration/invoice/createInvoice";
import { qboInvoiceUrl } from "@/features/quickbooks-integration/invoice/qboInvoiceUrl";
import { requireAdminOrAccountant } from "@/features/userAccess/logic/requireAdminOrAccountant";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

// Sends the browser to the quote's invoice in QuickBooks (docs/specs/qbo-invoice-08-view-and-check.md
// §3). Admin and accountant, on a quote of any office. The address is built here because only the
// server knows the QuickBooks environment; the link is read with the service role and nothing else
// of the quote is returned, only a redirect or { error }.
export async function GET(req: NextRequest) {
  try {
    await requireAdminOrAccountant();

    const eventId = req.nextUrl.searchParams.get("eventId");
    if (!eventId || !UUID_RE.test(eventId)) {
      return json({ error: "Missing or invalid eventId" }, 400);
    }

    const { data, error } = await getSupabaseAdmin()
      .from("Events")
      .select("id, qbo_invoice_id")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw new Error(`Failed to read the quote: ${error.message}`);
    if (!data) return json({ error: "Quote not found." }, 404);
    if (!data.qbo_invoice_id) {
      return json({ error: "This quote has no QuickBooks invoice yet." }, 404);
    }

    return NextResponse.redirect(
      qboInvoiceUrl(process.env.QBO_ENVIRONMENT, data.qbo_invoice_id),
      302,
    );
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to open the QuickBooks invoice:", error);
    return json({ error: error.message || "Failed to open the invoice" }, 500);
  }
}
