import {
  getAllQboConnections,
  createQboConnectionPlaceholder,
  deleteQboConnection,
  updateQboConnectionDisplayName,
  updateQboConnectionTaxCode,
} from "@/features/quickbooks-integration/db";
import { requireAdmin } from "@/features/userAccess/logic/requireAdmin";
import { requireAdminOrAccountant } from "@/features/userAccess/logic/requireAdminOrAccountant";
import { NextRequest, NextResponse } from "next/server";

// Reading the list is open to an accountant too: the vendor modal on the Team page picks the
// QuickBooks connection of a vendor (docs/specs/accountant-team.md). Every write stays admin-only.
export async function GET() {
  try {
    await requireAdminOrAccountant();
    const connections = await getAllQboConnections();
    return NextResponse.json({ connections });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to fetch QBO connections:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { displayName } = body;

    if (!displayName?.trim()) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    const connectionId = await createQboConnectionPlaceholder(displayName.trim());
    return NextResponse.json({ connectionId });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to create QBO connection:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();

    const connectionId = req.nextUrl.searchParams.get("connectionId");
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    await deleteQboConnection(connectionId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to delete QBO connection:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { connectionId, displayName } = body;

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400 });
    }

    // Handle tax code update
    if ("taxCodeId" in body) {
      await updateQboConnectionTaxCode(connectionId, body.taxCodeId ?? null);
      return NextResponse.json({ success: true });
    }

    if (!displayName?.trim()) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    await updateQboConnectionDisplayName(connectionId, displayName.trim());
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to update QBO connection:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
