import { createInvoice } from "@/features/quickbooks-integration/invoice/createInvoice";
import {
  overwriteInvoice,
  readLinkedInvoiceId,
  updateInvoice,
} from "@/features/quickbooks-integration/invoice/updateInvoice";
import type { CustomerChoice } from "@/features/quickbooks-integration/customers";
import { requireAdminOrAccountant } from "@/features/userAccess/logic/requireAdminOrAccountant";
import { resolveUserAccessForRequest } from "@/features/userAccess/logic/resolveUserAccessForRequest";
import { NextRequest, NextResponse } from "next/server";

// Creating or updating the invoice reads the quote, a customer, the PDF and talks to QuickBooks before
// it answers. On a plan capped at 10 s it can still time out (docs/specs/qbo-invoice-04-create.md R1);
// this raises the real limit for this route only, as create-bill does.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InvoiceRequest = {
  eventId: string;
  customerChoice?: CustomerChoice;
  replaceMissing?: boolean;
  overwriteInvoiceId?: string;
};

/** The choice of a customer, undefined when none was sent, null when it is malformed. */
function parseCustomerChoice(raw: unknown): CustomerChoice | undefined | null {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return null;
  const choice = raw as Record<string, unknown>;
  if (choice.kind === "new") return { kind: "new" };
  if (choice.kind === "existing" && typeof choice.customerId === "string" && choice.customerId) {
    return { kind: "existing", customerId: choice.customerId };
  }
  return null;
}

/** { eventId, customerChoice?, replaceMissing?, overwriteInvoiceId? }; anything else is refused. */
function parseBody(body: unknown): InvoiceRequest | null {
  if (!body || typeof body !== "object") return null;
  const { eventId, customerChoice, replaceMissing, overwriteInvoiceId } = body as Record<
    string,
    unknown
  >;
  if (typeof eventId !== "string" || !UUID_RE.test(eventId)) return null;

  const choice = parseCustomerChoice(customerChoice);
  if (choice === null) return null;
  if (replaceMissing !== undefined && typeof replaceMissing !== "boolean") return null;
  if (
    overwriteInvoiceId !== undefined &&
    (typeof overwriteInvoiceId !== "string" || !overwriteInvoiceId)
  ) {
    return null;
  }

  return {
    eventId,
    ...(choice ? { customerChoice: choice } : {}),
    ...(replaceMissing !== undefined ? { replaceMissing } : {}),
    ...(overwriteInvoiceId !== undefined ? { overwriteInvoiceId } : {}),
  };
}

// Creates, updates or links the QuickBooks invoice of a quote (docs/specs/qbo-invoice-04-create.md,
// docs/specs/qbo-invoice-05-update.md §4). Admin and accountant, on a quote of any office. The quote's
// link to an invoice decides which flow runs.
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

    const { eventId, customerChoice, replaceMissing, overwriteInvoiceId } = parsed;
    const flow = { eventId, customerChoice, userUuid: access.userId, origin: req.nextUrl.origin };

    const linkedInvoiceId = await readLinkedInvoiceId(eventId);
    let result;
    if (!linkedInvoiceId) {
      result = overwriteInvoiceId
        ? await overwriteInvoice({ ...flow, replaceMissing, overwriteInvoiceId })
        : await createInvoice(flow);
    } else if (replaceMissing && overwriteInvoiceId) {
      // The link points at an invoice QuickBooks no longer has, and the number is taken by another.
      result = await overwriteInvoice({ ...flow, replaceMissing, overwriteInvoiceId });
    } else {
      result = await updateInvoice({ ...flow, replaceMissing });
    }

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
