import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The dialog is a Radix portal, which draws nothing on the server. What is under test is what it
// says and which buttons it offers, so the dialog frame is a bare container that renders its
// children when it is open.
vi.mock("@/components/ui/dialog", () => {
  const frame = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? <div>{children}</div> : null,
    DialogContent: frame,
    DialogHeader: frame,
    DialogTitle: frame,
    DialogDescription: frame,
  };
});

import { PaymentDetailDialog } from "./PaymentDetailDialog";
import { allocatePayments } from "../../../utils/allocatePayments";
import type { PaymentHistoryRow } from "../../../hooks/usePaymentHistory";

// docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3, §6.3.

function payment(over: Partial<PaymentHistoryRow> = {}): PaymentHistoryRow {
  return {
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
    reference: "1041",
    deletedAt: null,
    deletedByUserUuid: null,
    deleteReason: null,
    ...over,
  };
}

const STRIPE = payment({
  id: "s1",
  entrySource: "stripe",
  paymentMethodType: "card",
  recordedByUserUuid: null,
  receiptUrl: "https://pay.stripe.com/r",
});

const DELETED = payment({
  id: "d1",
  deletedAt: "2026-08-20T12:00:00.000+00:00",
  deletedByUserUuid: "user-9",
  deleteReason: "entered twice on the wrong quote",
});

function render(p: PaymentHistoryRow, over: { canWrite?: boolean } = {}) {
  const allocation = allocatePayments(
    [],
    [
      {
        id: p.id,
        installmentId: p.installmentId,
        amountCents: p.amountCents,
        currency: p.currency,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        deletedAt: p.deletedAt,
      },
    ],
    "USD",
  );
  return renderToStaticMarkup(
    <PaymentDetailDialog
      open={true}
      onOpenChange={() => {}}
      payment={p}
      allocation={allocation}
      currency="USD"
      recordedBy="Dana Whitfield"
      canWrite={over.canWrite ?? true}
      deletedBy="Sam Admin"
      onEdit={() => {}}
      onDelete={() => {}}
    />,
  );
}

const hasButton = (html: string, name: string) =>
  new RegExp(`<button[^>]*>${name}</button>`).test(html);

describe("PaymentDetailDialog — Edit and Delete", () => {
  it("S1: offers both on a manual, undeleted payment to someone who writes payments", () => {
    const html = render(payment());
    expect(hasButton(html, "Edit")).toBe(true);
    expect(hasButton(html, "Delete")).toBe(true);
  });

  it("offers neither to someone who cannot write payments", () => {
    const html = render(payment(), { canWrite: false });
    expect(hasButton(html, "Edit")).toBe(false);
    expect(hasButton(html, "Delete")).toBe(false);
  });

  it("S1: offers neither on a Stripe payment, even to someone who writes payments", () => {
    const html = render(STRIPE);
    expect(hasButton(html, "Edit")).toBe(false);
    expect(hasButton(html, "Delete")).toBe(false);
  });

  it("offers neither on a deleted payment", () => {
    const html = render(DELETED);
    expect(hasButton(html, "Edit")).toBe(false);
    expect(hasButton(html, "Delete")).toBe(false);
  });
});

describe("PaymentDetailDialog — the line at the bottom", () => {
  it("S1: a Stripe payment says it cannot be edited or deleted", () => {
    expect(render(STRIPE)).toContain("Stripe payments cannot be edited or deleted.");
  });

  it("a manual payment no longer says so, nor tells anyone to record a negative instead", () => {
    const html = render(payment());
    expect(html).not.toContain("cannot be edited or deleted");
    expect(html).not.toContain("record a negative amount");
  });
});

describe("PaymentDetailDialog — a deleted payment", () => {
  it("says it was deleted", () => {
    expect(render(DELETED)).toContain("This payment was deleted");
    expect(render(DELETED, { canWrite: false })).toContain("This payment was deleted");
  });

  it("S5: to someone who writes payments, also says who deleted it, when, and why", () => {
    const html = render(DELETED);
    expect(html).toContain("Deleted by");
    expect(html).toContain("Sam Admin");
    expect(html).toContain("Deleted on");
    expect(html).toContain("Aug 20, 2026");
    expect(html).toContain("Reason");
    expect(html).toContain("entered twice on the wrong quote");
  });

  it("S6: to anyone else, says neither who, nor when, nor why", () => {
    const html = render(DELETED, { canWrite: false });
    expect(html).not.toContain("Deleted by");
    expect(html).not.toContain("Sam Admin");
    expect(html).not.toContain("Deleted on");
    expect(html).not.toContain("Aug 20, 2026");
    expect(html).not.toContain("Reason");
    expect(html).not.toContain("entered twice on the wrong quote");
  });

  it("explains in 'Applied To' that it is not counted because it was deleted, not because of a status", () => {
    const html = render(DELETED);
    expect(html).toContain("Not counted — this payment was deleted.");
    expect(html).not.toContain("the payment status is");
  });

  it("a payment that is not deleted shows none of this", () => {
    const html = render(payment());
    expect(html).not.toContain("This payment was deleted");
    expect(html).not.toContain("Deleted by");
  });
});
