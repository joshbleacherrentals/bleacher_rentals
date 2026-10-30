import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DELETED_PAYMENT,
  MANUAL_PAYMENT,
  invoiceDataFixture,
  paymentFixture,
} from "./invoiceFixtures";

const { loading } = vi.hoisted(() => ({ loading: [] as Promise<unknown>[] }));

// next/dynamic would load the three dialogs lazily in the browser. Here every loader is started
// at once and awaited before the tests run, so the stubs below draw as soon as the table asks.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
    let Loaded: React.ComponentType<Record<string, unknown>> | null = null;
    loading.push(
      loader().then((component) => {
        Loaded = component;
      }),
    );
    return (props: Record<string, unknown>) => (Loaded ? <Loaded {...props} /> : null);
  },
}));
vi.mock("@/features/quotesAndBookings/components/quoteDetail/tabs/PaymentDetailDialog", () => ({
  PaymentDetailDialog: (props: {
    payment: { id: string };
    canWrite: boolean;
    onEdit: () => void;
    onDelete: () => void;
  }) => (
    <div
      data-testid="payment-detail"
      data-payment-id={props.payment.id}
      data-can-write={String(props.canWrite)}
      data-has-edit={String(typeof props.onEdit === "function")}
      data-has-delete={String(typeof props.onDelete === "function")}
    />
  ),
}));
vi.mock("@/features/quotesAndBookings/components/quoteDetail/tabs/RecordPaymentDialog", () => ({
  RecordPaymentDialog: () => <div data-testid="record-payment" />,
}));
vi.mock("@/features/quotesAndBookings/components/quoteDetail/tabs/DeletePaymentDialog", () => ({
  DeletePaymentDialog: () => <div data-testid="delete-payment" />,
}));

import { PaymentHistoryTable } from "./PaymentHistoryTable";

beforeAll(() => Promise.all(loading));

const data = invoiceDataFixture();

function render(props: Partial<React.ComponentProps<typeof PaymentHistoryTable>> = {}) {
  return renderToStaticMarkup(
    <PaymentHistoryTable
      eventId="evt-1"
      payments={data.payments}
      allocation={data.allocation}
      currency="CAD"
      timezone="America/Toronto"
      staffNames={data.staffNames}
      canRecordPayment={true}
      recordedByUserUuid="user-7"
      onRecordPayment={() => {}}
      {...props}
    />,
  );
}

describe("PaymentHistoryTable", () => {
  it("lists the payments that are not deleted, with the five columns of the design", () => {
    const html = render();
    for (const header of ["#", "Date", "Amount", "Method", "Payer"]) {
      expect(html).toContain(`>${header}<`);
    }
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("Priya Raman");
    expect(html).toContain("C$3,235.75");
    expect(html).toContain("C$1,500.00");
    expect(html).toContain("Stripe");
    expect(html).toContain("Check");
  });

  it("starts with Show deleted off, and the deleted payment out of the list", () => {
    const html = render();
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(html).toContain("Show deleted");
    expect(html).not.toContain("Walter Deleted");
    expect(html).not.toContain("Deleted</span>");
  });

  it("brings the deleted payments back, tagged Deleted and struck through, when the switch is on", () => {
    const html = render({ initiallyShowDeleted: true });
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(html).toContain("Walter Deleted");
    expect(html).toContain("line-through");
    expect(html).toMatch(/>Deleted<\/span>/);
  });

  it("puts Show deleted beside Record Payment, the switch first", () => {
    const html = render();
    expect(html).toContain("Record payment");
    expect(html.indexOf("Show deleted")).toBeLessThan(html.indexOf("Record payment"));
  });

  it("draws no Record payment button to someone who may not record payments", () => {
    expect(render({ canRecordPayment: false })).not.toContain("Record payment");
  });

  it("makes every row clickable and reachable by keyboard, and puts no Edit or Delete in a row", () => {
    const html = render({ initiallyShowDeleted: true });
    expect(html.match(/<tr[^>]*tabindex="0"[^>]*aria-label="Payment details for/g)).toHaveLength(3);
    expect(html).not.toMatch(/>Edit</);
    expect(html).not.toMatch(/>Delete</);
  });

  it("opens the payment detail dialog for the row that was clicked, with Edit and Delete in it", () => {
    const html = render({ initiallyOpenPaymentId: MANUAL_PAYMENT.id });
    expect(html).toContain('data-testid="payment-detail"');
    expect(html).toContain(`data-payment-id="${MANUAL_PAYMENT.id}"`);
    expect(html).toContain('data-has-edit="true"');
    expect(html).toContain('data-has-delete="true"');
  });

  it("opens a Stripe payment's dialog too: the dialog itself withholds Edit and Delete", () => {
    const html = render({ initiallyOpenPaymentId: paymentFixture().id });
    expect(html).toContain(`data-payment-id="${paymentFixture().id}"`);
  });

  it("opens a deleted payment's dialog when the switch has shown it", () => {
    const html = render({
      initiallyShowDeleted: true,
      initiallyOpenPaymentId: DELETED_PAYMENT.id,
    });
    expect(html).toContain(`data-payment-id="${DELETED_PAYMENT.id}"`);
  });

  it("tells the dialog whether the viewer writes payments", () => {
    expect(render({ initiallyOpenPaymentId: MANUAL_PAYMENT.id })).toContain(
      'data-can-write="true"',
    );
    expect(
      render({ canRecordPayment: false, initiallyOpenPaymentId: MANUAL_PAYMENT.id }),
    ).toContain('data-can-write="false"');
  });

  it("says once that Stripe payments cannot be edited or deleted", () => {
    const html = render();
    expect(html.match(/Stripe payments cannot be edited or deleted\./g)).toHaveLength(1);
  });

  it("says so when there are no payments", () => {
    expect(render({ payments: [] })).toContain("No payments recorded yet.");
  });
});
