import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/ui/dialog", () => {
  const frame = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? <div>{children}</div> : null,
    DialogContent: frame,
    DialogHeader: frame,
    DialogTitle: frame,
    DialogDescription: frame,
    DialogFooter: frame,
  };
});
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));
vi.mock("../../../db/deleteManualPayment", () => ({ deleteManualPayment: vi.fn() }));

import { DeletePaymentDialog, DeleteReasonForm } from "./DeletePaymentDialog";
import type { PaymentHistoryRow } from "../../../hooks/usePaymentHistory";

// docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3, §6.3 (D4): only the reason prompt.
// Its Delete button is disabled while the reason is empty after trimming.

const form = (reason: string, isSubmitting = false) =>
  renderToStaticMarkup(
    <DeleteReasonForm
      reason={reason}
      onReasonChange={() => {}}
      isSubmitting={isSubmitting}
      onCancel={() => {}}
      onDelete={() => {}}
    />,
  );

const deleteButton = (html: string) =>
  /<button[^>]*>(?:Delete|Deleting…)<\/button>/.exec(html)?.[0] ?? "";

/** The attribute, not the word: the button's classes carry a `disabled:` variant of their own. */
const isDisabled = (button: string) => / disabled=""/.test(button);

describe("DeleteReasonForm", () => {
  it.each(["", "   ", "\t", " \n "])("S4: disables Delete for the reason %j", (reason) => {
    expect(isDisabled(deleteButton(form(reason)))).toBe(true);
  });

  it("S4: enables Delete once there is a reason, even one with spaces around it", () => {
    expect(isDisabled(deleteButton(form("x")))).toBe(false);
    expect(isDisabled(deleteButton(form("  entered twice ")))).toBe(false);
  });

  it("disables Delete while the deletion is being written, and says so", () => {
    const html = form("entered twice", true);
    expect(isDisabled(deleteButton(html))).toBe(true);
    expect(html).toContain("Deleting…");
  });

  it("asks for the reason in a text area, and keeps Cancel", () => {
    const html = form("");
    expect(html).toContain("<textarea");
    expect(html).toContain("Cancel");
  });

  it("asks for nothing more: no second confirmation step", () => {
    const html = form("entered twice");
    expect(html).not.toMatch(/cannot be undone/i);
    expect(html).not.toMatch(/are you sure/i);
  });
});

describe("DeletePaymentDialog", () => {
  const payment = {
    id: "p1",
    installmentId: null,
    amountCents: 10000,
    currency: "USD",
    status: "succeeded",
    paymentMethodType: "check",
    payerName: "Riverside High",
    payerEmail: null,
    notes: null,
    receiptUrl: null,
    paidAt: "2026-08-14T12:00:00.000+00:00",
    createdAt: "2026-08-14T15:30:00.000+00:00",
    intendedInstallmentId: null,
    entrySource: "manual",
    recordedByUserUuid: "user-7",
    reference: null,
    deletedAt: null,
    deletedByUserUuid: null,
    deleteReason: null,
  } satisfies PaymentHistoryRow;

  const render = (open: boolean) =>
    renderToStaticMarkup(
      <DeletePaymentDialog
        open={open}
        onOpenChange={() => {}}
        eventId="evt-1"
        payment={payment}
        deletedByUserUuid="user-9"
      />,
    );

  it("starts with Delete disabled: nothing has been typed", () => {
    expect(isDisabled(deleteButton(render(true)))).toBe(true);
  });

  it("names the payment being deleted", () => {
    expect(render(true)).toContain("$100.00");
  });

  it("says plainly that the payment stays on the record and no longer counts", () => {
    expect(render(true)).toMatch(/no longer counts/i);
  });

  it("draws nothing when closed", () => {
    expect(render(false)).toBe("");
  });
});
