import { getBaseUrl, getQboAccessTokenAndRealmId } from "@/features/quickbooks-integration/util";
import { requireAdminOrAccountant } from "@/features/userAccess/logic/requireAdminOrAccountant";
import { NextRequest, NextResponse } from "next/server";

/**
 * The Products/Services of a connection's QuickBooks company that an invoice line can be sold as,
 * for the picker on the Quote Types page.
 * Spec: docs/specs/qbo-invoice-12-event-type-services.md
 */

const PAGE_SIZE = 1000;
// A bundle is an Item of type "Group", whose invoice line is a GroupLineDetail, not the
// SalesItemLineDetail the invoice writes (spec 03); a Category cannot be sold.
const SELLABLE_TYPES = new Set(["Service", "NonInventory", "Inventory"]);

type RawQboItem = { Id: string; Name: string; FullyQualifiedName?: string; Type: string };

export async function GET(req: NextRequest) {
  try {
    await requireAdminOrAccountant();

    const connectionId = req.nextUrl.searchParams.get("connectionId");
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }
    const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);
    const baseUrl = getBaseUrl();

    // QuickBooks answers at most 100 rows unless MAXRESULTS is given, and pages with STARTPOSITION.
    const raw: RawQboItem[] = [];
    for (let start = 1; ; start += PAGE_SIZE) {
      const query = encodeURIComponent(
        `select * from Item where Active = true STARTPOSITION ${start} MAXRESULTS ${PAGE_SIZE}`,
      );
      const response = await fetch(`${baseUrl}/${realmId}/query?query=${query}&minorversion=40`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const fault = data?.Fault?.Error?.[0];
        console.error("QuickBooks API error:", data);
        return NextResponse.json(
          { error: fault?.Detail ?? fault?.Message ?? "QuickBooks refused the request" },
          { status: response.status },
        );
      }

      const page: RawQboItem[] = data?.QueryResponse?.Item ?? [];
      raw.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const items = raw
      .filter((item) => SELLABLE_TYPES.has(item.Type))
      .map((item) => ({
        id: item.Id,
        name: item.Name,
        fullyQualifiedName: item.FullyQualifiedName ?? item.Name,
        type: item.Type,
      }))
      .sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));

    return NextResponse.json({ items });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("QuickBooks items error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
