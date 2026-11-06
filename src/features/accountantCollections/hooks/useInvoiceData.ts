"use client";

import { useMemo } from "react";
import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { formatAddressForCopy } from "@/features/venues/logic/formatAddressForCopy";
import { useEventCurrencyState } from "@/features/quotesAndBookings/hooks/useEventCurrency";
import { useEventTypeName } from "@/features/quotesAndBookings/hooks/useEventTypeName";
import { usePaymentHistory } from "@/features/quotesAndBookings/hooks/usePaymentHistory";
import type { PaymentHistoryRow } from "@/features/quotesAndBookings/hooks/usePaymentHistory";
import { usePaymentInstallments } from "@/features/quotesAndBookings/hooks/usePaymentInstallments";
import { useQuoteDetail } from "@/features/quotesAndBookings/hooks/useQuoteDetail";
import { useToday } from "@/features/quotesAndBookings/hooks/useToday";
import { useUserNames } from "@/features/quotesAndBookings/hooks/useUserNames";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import type { Allocation } from "@/features/quotesAndBookings/utils/allocatePayments";
import { computeCollectionsBalances } from "../utils/collectionsBalances";
import { invoiceStatus, type InvoiceStatus } from "../utils/invoiceStatus";
import {
  buildContactCard,
  buildMoney,
  buildScheduleRows,
  buildTaskLists,
  type ContactCard,
  type InvoiceTaskRow,
  type MoneyView,
  type ScheduleRow,
  type TaskView,
} from "../utils/invoiceView";

/**
 * Everything the invoice page shows for one event, read reactively.
 * docs/specs/accountant-collections-08-invoice-data.md §3.
 *
 * It composes `useQuoteDetail` with narrow queries for what that hook does not read — the
 * contacts' companies, the venue's address, the tasks and the line total — and reuses the Billing
 * tab's hooks for the schedule, the payments and the currency. The figures come from
 * `computeCollectionsBalances` (the twin of the SQL), so the page cannot disagree with the list.
 *
 * `isLoading` also covers the currency: it stays true until the office currency is resolved, so
 * nothing is drawn in the USD fallback.
 *
 * `notFound` is true when there is no quote to show once the quote has answered — a missing event,
 * and also a failed read, which the output has no field for.
 */

export type InvoiceData = {
  isLoading: boolean;
  notFound: boolean;
  event: {
    name: string;
    invoiceNumber: number | null;
    status: InvoiceStatus;
    /** The twin's figure; the page shows it for Collections only. */
    daysOverdue: number | null;
    accountManager: string | null;
  };
  contacts: { contact: ContactCard | null; financeContact: ContactCard | null };
  venue: { name: string | null; address: string | null };
  eventInfo: { start: string | null; end: string | null; type: string | null };
  money: MoneyView;
  schedule: ScheduleRow[];
  /** Every payment row, deleted ones too: the page filters them with `buildPaymentRows`. */
  payments: PaymentHistoryRow[];
  allocation: Allocation;
  staffNames: Map<string, string>;
  tasks: { open: TaskView | null; completed: TaskView[] };
  currency: Currency;
  today: string;
};

type ContactCompanyRow = {
  contact_id: string;
  company_id: string | null;
  company_name: string | null;
  company_phone: string | null;
  company_email: string | null;
};

type VenueAddressRow = {
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
};

export function useInvoiceData(eventId: string): InvoiceData {
  const timezone = useTimezoneStore((s) => s.timezone);
  const today = useToday(timezone);

  const { quote, isLoading: quoteLoading } = useQuoteDetail(eventId);

  // The companies of the event's contact and finance contact, in one query.
  const companiesCompiled = useMemo(
    () =>
      db
        .selectFrom("Contacts as c")
        .leftJoin("Companies as co", "co.id", "c.company_uuid")
        .select([
          "c.id as contact_id",
          "co.id as company_id",
          "co.company_name as company_name",
          "co.phone as company_phone",
          "co.email as company_email",
        ])
        .where((eb) =>
          eb.or([
            eb(
              "c.id",
              "in",
              eb.selectFrom("Events").select("contact_uuid").where("id", "=", eventId),
            ),
            eb(
              "c.id",
              "in",
              eb.selectFrom("Events").select("finance_contact_uuid").where("id", "=", eventId),
            ),
          ]),
        )
        .compile(),
    [eventId],
  );

  const venueAddressCompiled = useMemo(
    () =>
      db
        .selectFrom("Addresses")
        .select(["street", "city", "state_province", "zip_postal"])
        .where("id", "in", (eb) =>
          eb
            .selectFrom("Venues")
            .select("address_uuid")
            .where("id", "in", (vb) =>
              vb.selectFrom("Events").select("venue_uuid").where("id", "=", eventId),
            ),
        )
        .compile(),
    [eventId],
  );

  const tasksCompiled = useMemo(
    () =>
      db
        .selectFrom("ArEventTasks")
        .select(["id", "created_at", "due_date", "note", "completed"])
        .where("event_uuid", "=", eventId)
        .compile(),
    [eventId],
  );

  const lineTotalCompiled = useMemo(
    () =>
      db
        .selectFrom("EventLineItems")
        .select(
          sql<number>`coalesce(sum(coalesce(${sql.ref("quantity")}, 1) * coalesce(${sql.ref("value_cents")}, 0)), 0)`.as(
            "line_total_cents",
          ),
        )
        .where("event_uuid", "=", eventId)
        .where("deleted", "=", 0)
        .compile(),
    [eventId],
  );

  const companies = useTypedQuery(companiesCompiled, expect<ContactCompanyRow>());
  const venueAddress = useTypedQuery(venueAddressCompiled, expect<VenueAddressRow>());
  const tasks = useTypedQuery(tasksCompiled, expect<InvoiceTaskRow>());
  const lineTotal = useTypedQuery(lineTotalCompiled, expect<{ line_total_cents: number }>());
  const { installments: terms, isLoading: installmentsLoading } = usePaymentInstallments(eventId);
  const { payments, isLoading: paymentsLoading } = usePaymentHistory(eventId);
  const { currency, isResolved: currencyResolved } = useEventCurrencyState(eventId);
  const staffNames = useUserNames();
  const { name: eventTypeName } = useEventTypeName(quote?.eventTypeUuid ?? null);

  const lineTotalCents = lineTotal.data?.[0]?.line_total_cents ?? 0;

  const balances = useMemo(
    () =>
      computeCollectionsBalances({
        event: {
          event_start: quote?.eventStart ?? null,
          booked_at: quote?.bookedAt ?? null,
          tax_percent: quote?.taxPercent ?? null,
          tax_amount_cents: quote?.taxAmountCents ?? null,
        },
        lineTotalCents,
        installments: terms.map((t) => ({
          id: t.id,
          event_uuid: eventId,
          due_date: t.dueDate,
          percentage_bps: t.percentageBps,
        })),
        payments: payments.map((p) => ({
          id: p.id,
          event_uuid: eventId,
          installment_id: p.installmentId,
          amount_cents: p.amountCents,
          currency: p.currency,
          status: p.status,
          paid_at: p.paidAt,
          created_at: p.createdAt,
          deleted_at: p.deletedAt,
        })),
        currency,
        today,
      }),
    [quote, lineTotalCents, terms, payments, currency, today, eventId],
  );

  const notFound = !quoteLoading && quote === null;
  const isLoading =
    !notFound &&
    (quoteLoading ||
      companies.isLoading ||
      venueAddress.isLoading ||
      tasks.isLoading ||
      lineTotal.isLoading ||
      installmentsLoading ||
      paymentsLoading ||
      !currencyResolved);

  const companyOf = (contactId: string | undefined) => {
    const row = (companies.data ?? []).find((r) => r.contact_id === contactId);
    return row?.company_id
      ? { company_name: row.company_name, phone: row.company_phone, email: row.company_email }
      : null;
  };

  const venue = useMemo(() => {
    const row = venueAddress.data?.[0];
    const own = row
      ? formatAddressForCopy({
          street: row.street ?? "",
          city: row.city ?? "",
          stateProvince: row.state_province ?? "",
          zipPostal: row.zip_postal ?? "",
        })
      : "";
    if (quote?.venue) return { name: quote.venue.name, address: own || null };
    // No venue: the event's own address, and no name.
    const eventAddress = quote?.address
      ? formatAddressForCopy({ ...quote.address, zipPostal: quote.address.zipPostal ?? "" })
      : "";
    return { name: null, address: eventAddress || null };
  }, [venueAddress.data, quote]);

  const accountManager =
    [quote?.accountManager?.firstName, quote?.accountManager?.lastName].filter(Boolean).join(" ") ||
    null;

  return {
    isLoading,
    notFound,
    event: {
      name: quote?.eventName ?? "",
      invoiceNumber: quote?.invoiceNumber ?? null,
      status: invoiceStatus({
        eventStatus: quote?.eventStatus ?? null,
        remainingCents: balances.remainingCents,
        amountDueCents: balances.amountDueCents,
      }),
      daysOverdue: balances.daysOverdue,
      accountManager,
    },
    contacts: {
      contact: buildContactCard(quote?.contact ?? null, companyOf(quote?.contact?.id)),
      financeContact: buildContactCard(
        quote?.financeContact ?? null,
        companyOf(quote?.financeContact?.id),
      ),
    },
    venue,
    eventInfo: {
      start: quote?.eventStart ?? null,
      end: quote?.eventEnd ?? null,
      type: eventTypeName,
    },
    money: buildMoney(balances, lineTotalCents, quote?.taxPercent ?? null),
    schedule: buildScheduleRows(balances.allocation, currency, timezone),
    payments,
    allocation: balances.allocation,
    staffNames,
    tasks: buildTaskLists(tasks.data ?? [], today),
    currency,
    today,
  };
}
