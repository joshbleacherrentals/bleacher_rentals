import { createInvoice } from "@/features/quickbooks-integration/invoice/createInvoice";
import type { CustomerChoice } from "@/features/quickbooks-integration/customers";
import { requireAdminOrAccountant } from "@/features/userAccess/logic/requireAdminOrAccountant";
import { resolveUserAccessForRequest } from "@/features/userAccess/logic/resolveUserAccessForRequest";
import { NextRequest, NextResponse } from "next/server";

// Creating the invoice reads the quote, a customer, the PDF and talks to QuickBooks before it
// answers. On a plan capped at 10 s it can still time out (docs/specs/qbo-invoice-04-create.md R1);
// this raises the real limit for this route only, as create-bill does.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** { eventId, customerChoice? }; anything else is refused. */
function parseBody(body: unknown): { eventId: string; customerChoice?: CustomerChoice } | null {
  if (!body || typeof body !== "object") return null;
  const { eventId, customerChoice } = body as Record<string, unknown>;
  if (typeof eventId !== "string" || !UUID_RE.test(eventId)) return null;
  if (customerChoice === undefined) return { eventId };

  if (!customerChoice || typeof customerChoice !== "object") return null;
  const choice = customerChoice as Record<string, unknown>;
  if (choice.kind === "new") return { eventId, customerChoice: { kind: "new" } };
  if (choice.kind === "existing" && typeof choice.customerId === "string" && choice.customerId) {
    return { eventId, customerChoice: { kind: "existing", customerId: choice.customerId } };
  }
  return null;
}

// Creates the QuickBooks invoice of a booked quote (docs/specs/qbo-invoice-04-create.md).
// Admin and accountant, on a quote of any office.
export async function POST(req: NextRequest) {
  try {
    const clerkUserId = await requireAdminOrAccountant();

    const parsed = parseBody(await req.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json({ error: "Missing or invalid eventId" }, { status: 400 });
    }

    // The Log is written under Users.id, not the Clerk id.
    const access = await resolveUserAccessForRequest(clerkUserId);
    if (access.status !== "active") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await createInvoice({
      ...parsed,
      userUuid: access.userId,
      origin: req.nextUrl.origin,
    });

    if (result.status === "error") {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Failed to create QuickBooks invoice:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create invoice" },
      { status: 500 },
    );
  }
}
