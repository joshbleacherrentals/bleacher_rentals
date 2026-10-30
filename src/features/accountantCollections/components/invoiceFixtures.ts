import type { PaymentHistoryRow } from "@/features/quotesAndBookings/hooks/usePaymentHistory";
import type { InvoiceData } from "../hooks/useInvoiceData";

/**
 * Test data for the invoice screens: one Collections event, "today" is Nov 10, 2026, as in
 * docs/design/accountant-collections. Used by the component tests only.
 */

export function paymentFixture(over: Partial<PaymentHistoryRow> = {}): PaymentHistoryRow {
  return {
    id: "pay-stripe",
    installmentId: null,
    amountCents: 323575,
    currency: "CAD",
    status: "succeeded",
    paymentMethodType: "card",
    payerName: "Dana Whitfield",
    payerEmail: null,
    notes: null,
    receiptUrl: null,
    paidAt: "2026-08-29T15:14:00.000Z",
    createdAt: "2026-08-29T15:14:00.000Z",
    intendedInstallmentId: null,
    entrySource: "stripe",
    recordedByUserUuid: null,
    reference: null,
    deletedAt: null,
    deletedByUserUuid: null,
    deleteReason: null,
    ...over,
  };
}

export const MANUAL_PAYMENT = paymentFixture({
  id: "pay-manual",
  amountCents: 150000,
  paymentMethodType: "check",
  payerName: "Priya Raman",
  entrySource: "manual",
  recordedByUserUuid: "user-7",
  paidAt: "2026-11-03T11:14:00.000Z",
  createdAt: "2026-11-03T11:14:00.000Z",
});

export const DELETED_PAYMENT = paymentFixture({
  id: "pay-deleted",
  amountCents: 50000,
  paymentMethodType: "check",
  payerName: "Walter Deleted",
  entrySource: "manual",
  recordedByUserUuid: "user-7",
  paidAt: "2026-11-05T09:40:00.000Z",
  createdAt: "2026-11-05T09:40:00.000Z",
  deletedAt: "2026-11-06T10:00:00.000Z",
  deletedByUserUuid: "user-7",
  deleteReason: "Entered twice",
});

export function invoiceDataFixture(over: Partial<InvoiceData> = {}): InvoiceData {
  return {
    isLoading: false,
    notFound: false,
    event: {
      name: "Riverside Charity Run",
      invoiceNumber: 123456,
      status: "collections",
      daysOverdue: 3,
      accountManager: "Max Gavryshkiv",
    },
    contacts: {
      contact: {
        name: "Dana Whitfield",
        phone: "(416) 555-0142",
        email: "dana.whitfield@riverside.example",
        company: {
          name: "Riverside Charity Foundation",
          phone: "(416) 555-0100",
          email: "office@riverside.example",
        },
      },
      financeContact: {
        name: "Priya Raman",
        phone: "(416) 555-0177",
        email: "priya.raman@ramanco.example",
        company: {
          name: "Raman & Co. Accounting",
          phone: "(416) 555-0190",
          email: "accounts@ramanco.example",
        },
      },
    },
    venue: { name: "Riverside Park, Field 3", address: "120 Riverside Drive, Toronto, ON" },
    eventInfo: { start: "2026-10-24", end: "2026-10-25", type: "Sports" },
    money: {
      contractSubtotalCents: 1125478,
      taxesLabel: "Taxes (15%)",
      taxesCents: 168822,
      totalCents: 1294300,
      alreadyPaidCents: 473575,
      remainingCents: 820725,
      currentOverdueCents: 173575,
    },
    schedule: [
      {
        number: 1,
        dueDate: "Aug 30, 2026",
        amountCents: 323575,
        amount: "C$3,235.75",
        status: "Paid",
        partialText: null,
        paidAt: "Aug 29, 2026 at 3:14 PM",
      },
      {
        number: 2,
        dueDate: "Nov 7, 2026",
        amountCents: 323575,
        amount: "C$3,235.75",
        status: "Partial",
        partialText: "C$1,500.00 of C$3,235.75",
        paidAt: null,
      },
      {
        number: 3,
        dueDate: "Nov 14, 2026",
        amountCents: 323575,
        amount: "C$3,235.75",
        status: "Unpaid",
        partialText: null,
        paidAt: null,
      },
    ],
    payments: [paymentFixture(), MANUAL_PAYMENT, DELETED_PAYMENT],
    allocation: {
      installments: [],
      byPayment: [],
      totalReceivedCents: 473575,
      allocatedCents: 473575,
      unallocatedCents: 0,
      foreignCurrencyPayments: [],
    },
    staffNames: new Map([["user-7", "Max Gavryshkiv"]]),
    tasks: {
      open: {
        id: "task-open",
        dueDate: "2026-11-10",
        note: "Called again to follow up and he said the check was sent yesterday.",
        followUpLabel: "Due Today",
      },
      completed: [
        {
          id: "task-1",
          dueDate: "2026-11-07",
          note: "Call to the customer and ask about payment",
          followUpLabel: "3 days ago",
        },
        {
          id: "task-2",
          dueDate: "2026-10-31",
          note: "Send a follow up message to the customer",
          followUpLabel: "10 days ago",
        },
      ],
    },
    currency: "CAD",
    today: "2026-11-10",
    ...over,
  };
}
