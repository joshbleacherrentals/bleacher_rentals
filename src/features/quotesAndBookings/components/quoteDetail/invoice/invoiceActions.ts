import type {
  CustomerChoice,
  QboCustomerSummary,
} from "@/features/quickbooks-integration/customers";
import type { InvoiceWarning } from "@/features/quickbooks-integration/invoice/createInvoice";
import type { ExistingInvoice } from "@/features/quickbooks-integration/invoice/qboInvoiceApi";
import type { UpdateInvoiceResult } from "@/features/quickbooks-integration/invoice/updateInvoice";

/**
 * What the Billing tab's Create invoice and Update invoice buttons do: ask the invoice route and
 * decide, from its answer, which toast or window comes next. Online only (the route talks to
 * QuickBooks); nothing here writes to the local database.
 * Spec: docs/specs/qbo-invoice-07-card-buttons.md §3 and §4
 */

/** The route's body, as `POST /api/quickbooks/invoice` reads it. */
export type InvoiceRequest = {
  eventId: string;
  customerChoice?: CustomerChoice;
  replaceMissing?: boolean;
  overwriteInvoiceId?: string;
};

/** The route's answers of HTTP 200 (specs 04 and 05); its errors are exceptions of `postInvoice`. */
export type InvoiceResult = Exclude<UpdateInvoiceResult, { status: "error" }>;

export const NETWORK_ERROR_MESSAGE =
  "Could not reach the server. Check your connection and try again.";

export const NOT_FOUND_DECLINED_MESSAGE =
  "If the invoice was not deleted in QuickBooks, this is probably a bug — please tell the developer.";

export async function postInvoice(request: InvoiceRequest): Promise<InvoiceResult> {
  let response: Response;
  try {
    response = await fetch("/api/quickbooks/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  // A platform error page (a 504, say) has no JSON; the status is then all there is to say.
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string" && body.error
        ? body.error
        : `The server answered ${response.status}. Try again.`,
    );
  }
  return body as InvoiceResult;
}

/** The text of one warning of a `created` or `updated` answer; each is shown as its own toast. */
export function warningMessage(warning: InvoiceWarning): string {
  switch (warning.code) {
    case "pdf_not_attached":
      return `The PDF was not attached (${warning.reason}). Press Update invoice to try again.`;
    case "totals_check_failed":
      return "The totals could not be checked.";
    case "class_missing":
      return `No QuickBooks Class was found for ${warning.state}. The invoice was made without one; set the Class in QuickBooks.`;
    case "tax_code_missing":
      return `No QuickBooks tax code is mapped for ${warning.province}. The invoice was made without tax; map the code on the QuickBooks page, then press Update invoice.`;
  }
}

/** Which button was pressed; a request that follows a window keeps the label of the press. */
export type InvoiceAction = "create" | "update";

/**
 * The window the screen shows. Each one that waits for an answer carries the request that was sent,
 * so the answer re-sends it with one more field.
 */
export type InvoiceDialog =
  | { kind: "confirm_update" }
  | {
      kind: "choose_customer";
      action: InvoiceAction;
      request: InvoiceRequest;
      candidates: QboCustomerSummary[];
    }
  | {
      kind: "number_exists";
      action: InvoiceAction;
      request: InvoiceRequest;
      invoice: ExistingInvoice;
    }
  | { kind: "not_found"; action: InvoiceAction; request: InvoiceRequest };

/** Everything the flow touches, so that it can be run without a browser. */
export type InvoiceFlowIo = {
  post: (request: InvoiceRequest) => Promise<InvoiceResult>;
  setDialog: (dialog: InvoiceDialog | null) => void;
  /** The action whose request is open, or null. */
  setBusy: (busy: InvoiceAction | null) => void;
  /** The invoice number of a `created` or `updated` answer, kept until sync shows the link. */
  remember: (docNumber: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  fail: (message: string) => void;
};

export function createInvoiceFlow(eventId: string, io: InvoiceFlowIo) {
  const settle = (action: InvoiceAction, request: InvoiceRequest, result: InvoiceResult) => {
    switch (result.status) {
      case "created":
      case "updated":
        io.remember(result.docNumber);
        io.success(
          result.status === "created"
            ? `Invoice ${result.docNumber} created in QuickBooks`
            : `Invoice ${result.docNumber} updated`,
        );
        for (const warning of result.warnings) io.warn(warningMessage(warning));
        return;
      case "choose_customer":
        io.setDialog({ kind: "choose_customer", action, request, candidates: result.candidates });
        return;
      case "invoice_number_exists":
        io.setDialog({ kind: "number_exists", action, request, invoice: result.invoice });
        return;
      case "invoice_missing":
        io.setDialog({ kind: "not_found", action, request });
        return;
    }
  };

  const send = async (action: InvoiceAction, request: InvoiceRequest) => {
    io.setBusy(action);
    try {
      settle(action, request, await io.post(request));
    } catch (error) {
      io.fail(error instanceof Error ? error.message : String(error));
    } finally {
      io.setBusy(null);
    }
  };

  return {
    /** Create sends at once; Update always asks first. */
    press: async (action: InvoiceAction) => {
      if (action === "update") {
        io.setDialog({ kind: "confirm_update" });
        return;
      }
      await send("create", { eventId });
    },
    confirmUpdate: async () => {
      io.setDialog(null);
      await send("update", { eventId });
    },
    chooseCustomer: async (
      dialog: Extract<InvoiceDialog, { kind: "choose_customer" }>,
      customerChoice: CustomerChoice,
    ) => {
      io.setDialog(null);
      await send(dialog.action, { ...dialog.request, customerChoice });
    },
    overwrite: async (dialog: Extract<InvoiceDialog, { kind: "number_exists" }>) => {
      io.setDialog(null);
      await send(dialog.action, { ...dialog.request, overwriteInvoiceId: dialog.invoice.id });
    },
    replaceMissing: async (dialog: Extract<InvoiceDialog, { kind: "not_found" }>) => {
      io.setDialog(null);
      await send(dialog.action, { ...dialog.request, replaceMissing: true });
    },
    declineMissing: () => {
      io.setDialog(null);
      io.fail(NOT_FOUND_DECLINED_MESSAGE);
    },
    /** Closing a window, by its button or by clicking outside it, sends nothing. */
    cancel: () => io.setDialog(null),
  };
}

export type InvoiceFlow = ReturnType<typeof createInvoiceFlow>;
