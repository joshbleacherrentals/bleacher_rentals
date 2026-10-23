"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import type { Currency } from "../../../types/quoteTypes";
import { CustomerChoiceDialog } from "./CustomerChoiceDialog";
import { InvoiceNotFoundDialog } from "./InvoiceNotFoundDialog";
import { InvoiceNumberExistsDialog } from "./InvoiceNumberExistsDialog";
import {
  createInvoiceFlow,
  postInvoice,
  type InvoiceAction,
  type InvoiceDialog,
  type InvoiceFlow,
} from "./invoiceActions";
import { useInvoiceState } from "./useInvoiceState";

/**
 * Create invoice / Update invoice, in the QuickBooks section of the Billing tab. The tab draws it
 * only for a user who may (`can.manageQuickBooksInvoice`); this decides which button, if any.
 * Spec: docs/specs/qbo-invoice-07-card-buttons.md §4
 */

/** The button itself: no invoice and a booked quote is Create, an invoice is Update, else nothing. */
export function InvoiceButtonsView({
  hasInvoice,
  canCreate,
  busy,
  onPress,
}: {
  hasInvoice: boolean;
  canCreate: boolean;
  /** The action whose request is open: the label says so and the button cannot be pressed again. */
  busy: InvoiceAction | null;
  onPress: (action: InvoiceAction) => void;
}) {
  const action: InvoiceAction | null =
    busy ?? (hasInvoice ? "update" : canCreate ? "create" : null);
  if (!action) return null;

  const label = busy
    ? busy === "create"
      ? "Creating…"
      : "Updating…"
    : action === "create"
      ? "Create invoice"
      : "Update invoice";

  return (
    <button
      type="button"
      onClick={() => onPress(action)}
      disabled={busy !== null}
      className="mt-3 text-xs font-medium text-darkBlue border border-darkBlue rounded px-2 py-1 hover:bg-blue-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/** The window the flow is waiting on, if any; each answer goes back to the flow. */
export function InvoiceDialogs({
  dialog,
  currency,
  flow,
}: {
  dialog: InvoiceDialog | null;
  currency: Currency;
  flow: InvoiceFlow;
}) {
  switch (dialog?.kind) {
    case "confirm_update":
      return (
        <ConfirmDialog
          open
          title="Update the QuickBooks invoice?"
          message="This replaces its content with this quote's current data, including any change made by hand in QuickBooks."
          confirmLabel="Update invoice"
          destructive={false}
          onConfirm={flow.confirmUpdate}
          onCancel={flow.cancel}
        />
      );
    case "choose_customer":
      return (
        <CustomerChoiceDialog
          candidates={dialog.candidates}
          onChoose={(choice) => flow.chooseCustomer(dialog, choice)}
          onCancel={flow.cancel}
        />
      );
    case "number_exists":
      return (
        <InvoiceNumberExistsDialog
          invoice={dialog.invoice}
          currency={currency}
          onOverwrite={() => flow.overwrite(dialog)}
          onCancel={flow.cancel}
        />
      );
    case "not_found":
      return (
        <InvoiceNotFoundDialog
          onYes={() => flow.replaceMissing(dialog)}
          onNo={flow.declineMissing}
          onCancel={flow.cancel}
        />
      );
    default:
      return null;
  }
}

export function InvoiceButtons({ eventId, currency }: { eventId: string; currency: Currency }) {
  const { hasInvoice, canCreate, rememberInvoice } = useInvoiceState(eventId);
  const [dialog, setDialog] = useState<InvoiceDialog | null>(null);
  const [busy, setBusy] = useState<InvoiceAction | null>(null);

  const flow = useMemo(
    () =>
      createInvoiceFlow(eventId, {
        post: postInvoice,
        setDialog,
        setBusy,
        remember: rememberInvoice,
        success: (message) => createSuccessToast([message]),
        // There is no warning toast: a warning asks the accountant to do something, so it is drawn
        // as the error toast, which does not throw (createErrorToast would end this handler).
        warn: (message) => createErrorToastNoThrow([message]),
        fail: (message) => createErrorToastNoThrow([message]),
      }),
    [eventId, rememberInvoice],
  );

  return (
    <>
      <InvoiceButtonsView
        hasInvoice={hasInvoice}
        canCreate={canCreate}
        busy={busy}
        onPress={flow.press}
      />
      <InvoiceDialogs dialog={dialog} currency={currency} flow={flow} />
    </>
  );
}
