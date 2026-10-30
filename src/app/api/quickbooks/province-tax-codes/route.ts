import { getProvinceTaxCodes, setProvinceTaxCode } from "@/features/quickbooks-integration/db";
import { CANADIAN_PROVINCES } from "@/features/quotesAndBookings/utils/canadianTaxRates";
import { requireAdmin } from "@/features/userAccess/logic/requireAdmin";
import { NextRequest, NextResponse } from "next/server";

// The QuickBooks tax code of each Canadian province, per connection
// (docs/specs/qbo-invoice-03a-province-tax-codes.md). Admin-only, like the rest of /quickbooks.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const connectionId = req.nextUrl.searchParams.get("connectionId");
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    const provinceTaxCodes = await getProvinceTaxCodes(connectionId);
    return NextResponse.json({ provinceTaxCodes });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to fetch province tax codes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();

    const { connectionId, province, taxCodeId } = await req.json();

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }
    if (typeof province !== "string" || !Object.hasOwn(CANADIAN_PROVINCES, province)) {
      return NextResponse.json(
        { error: "province must be a Canadian province code" },
        { status: 400 },
      );
    }
    // A body that forgot taxCodeId must not be read as "remove the code".
    if (taxCodeId !== null && (typeof taxCodeId !== "string" || taxCodeId === "")) {
      return NextResponse.json(
        { error: "taxCodeId must be a tax code id or null" },
        { status: 400 },
      );
    }

    await setProvinceTaxCode(connectionId, province, taxCodeId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to set province tax code:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
