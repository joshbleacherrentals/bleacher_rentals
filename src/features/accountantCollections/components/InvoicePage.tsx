"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useQuotesBookingsCapabilities } from "@/features/quotesAndBookings/hooks/useQuotesBookingsCapabilities";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useInvoiceData } from "../hooks/useInvoiceData";
import { parseCollectionsListState } from "../utils/collectionsListState";
import { collectionsHref, parseInvoiceTab, type InvoiceTab } from "../utils/invoiceUrl";
import { InvoiceHeader } from "./InvoiceHeader";
import { InvoiceInformation } from "./InvoiceInformation";
import { InvoiceTasks } from "./InvoiceTasks";

/**
 * The invoice page of one event: sticky header and tabs, Information or Tasks, and the footer with
 * Previous Task and Next Task (drawn, inactive until spec 10). The event, the tab and the list's
 * order come from the URL. docs/specs/accountant-collections-09-design.md §3.
 */

// Same reasoning as on the Billing tab: a form most visits never open.
const RecordPaymentDialog = dynamic(
  () =>
    import("@/features/quotesAndBookings/components/quoteDetail/tabs/RecordPaymentDialog").then(
      (m) => m.RecordPaymentDialog,
    ),
  { ssr: false },
);

const TABS: { id: InvoiceTab; label: string }[] = [
  { id: "info", label: "Information" },
  { id: "tasks", label: "Tasks" },
];

const FOOTER_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 cursor-not-allowed opacity-50";

export function InvoicePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("id") ?? "";
  const tab = parseInvoiceTab(searchParams.get("tab"));
  const listState = useMemo(() => parseCollectionsListState(searchParams), [searchParams]);

  const data = useInvoiceData(eventId);
  const can = useQuotesBookingsCapabilities();
  const userId = usePermissionsStore((s) => s.userId);
  const timezone = useTimezoneStore((s) => s.timezone);
  const [recordOpen, setRecordOpen] = useState(false);

  const backHref = collectionsHref(listState);

  if (data.notFound) {
    return (
      <div className="mx-auto flex max-w-[1040px] flex-col items-start gap-3 px-8 py-6">
        <p className="text-base font-semibold">Invoice not found</p>
        <Link href={backHref} className="text-sm font-medium text-darkBlue hover:underline">
          Back to Collections
        </Link>
      </div>
    );
  }

  if (data.isLoading) {
    return (
      <div className="mx-auto max-w-[1040px] px-8 py-6 text-sm text-gray-400">Loading invoice…</div>
    );
  }

  const selectTab = (next: InvoiceTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-[1040px] px-8 pb-14 pt-2">
      <Link
        href={backHref}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-darkBlue hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to tasks
      </Link>

      <div className="sticky top-0 z-10 rounded-t-[10px] bg-gradient-to-r from-gray-800 to-gray-600">
        <InvoiceHeader
          name={data.event.name}
          status={data.event.status}
          daysOverdue={data.event.daysOverdue}
          canRecordPayment={can.recordPayment}
          onRecordPayment={() => setRecordOpen(true)}
        />
        <div role="tablist" aria-label="Invoice sections" className="flex gap-1 px-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => selectTab(id)}
              className={`flex-1 cursor-pointer rounded-t-md px-3 py-3.5 text-base font-medium ${
                tab === id ? "bg-white text-gray-900" : "bg-black/20 text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-6 rounded-b-[10px] border border-t-0 border-gray-200 bg-white p-6">
        {tab === "tasks" ? (
          <InvoiceTasks eventId={eventId} tasks={data.tasks} today={data.today} />
        ) : (
          <InvoiceInformation
            eventId={eventId}
            data={data}
            timezone={timezone}
            canRecordPayment={can.recordPayment}
            recordedByUserUuid={userId}
            onRecordPayment={() => setRecordOpen(true)}
          />
        )}

        <div className="flex justify-between gap-4 border-t border-gray-200 pt-6">
          <button type="button" disabled aria-disabled="true" className={FOOTER_BUTTON}>
            <ArrowLeft className="size-[18px]" aria-hidden />
            Previous Task
          </button>
          <button type="button" disabled aria-disabled="true" className={FOOTER_BUTTON}>
            Next Task
            <ArrowRight className="size-[18px]" aria-hidden />
          </button>
        </div>
      </div>

      {can.recordPayment && recordOpen && (
        <RecordPaymentDialog
          open={recordOpen}
          onOpenChange={setRecordOpen}
          eventId={eventId}
          currency={data.currency}
          // The page is not drawn until the currency is resolved (`useInvoiceData`).
          currencyResolved={true}
          installments={data.allocation.installments}
          defaultPayerName={data.contacts.contact?.name ?? ""}
          recordedByUserUuid={userId}
        />
      )}
    </div>
  );
}
