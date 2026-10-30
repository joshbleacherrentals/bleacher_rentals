import { formatDate } from "@/features/quotesAndBookings/utils/formatDate";
import type { InvoiceData } from "../hooks/useInvoiceData";
import { ContactCards } from "./ContactCards";
import { MoneyCard } from "./MoneyCard";
import { PaymentHistoryTable } from "./PaymentHistoryTable";
import { PaymentScheduleTable } from "./PaymentScheduleTable";

/**
 * The Information tab: invoice and account manager, the contacts, the venue and event cards, the
 * money, the schedule and the payments. docs/specs/accountant-collections-09-design.md §3.
 */

const SECTION_TITLE = "mb-3 text-xs font-bold uppercase tracking-wider text-gray-500";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

export function InvoiceInformation({
  eventId,
  data,
  timezone,
  canRecordPayment,
  recordedByUserUuid,
  onRecordPayment,
}: {
  eventId: string;
  data: InvoiceData;
  timezone: string;
  canRecordPayment: boolean;
  recordedByUserUuid: string | null;
  onRecordPayment: () => void;
}) {
  const { event, contacts, venue, eventInfo } = data;
  return (
    <div role="tabpanel" aria-label="Information" className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 rounded-[10px] border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <div>
          <span className="text-gray-500">Invoice</span>
          <span className="ml-2 font-semibold">{event.invoiceNumber ?? "—"}</span>
        </div>
        <div>
          <span className="text-gray-500">Account Manager</span>
          <span className="ml-2 font-semibold">{event.accountManager ?? "—"}</span>
        </div>
      </div>

      <ContactCards contact={contacts.contact} financeContact={contacts.financeContact} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
        <section aria-label="Venue" className="rounded-[10px] border border-gray-200 bg-white p-5">
          <h3 className={SECTION_TITLE}>Venue</h3>
          <div className="flex flex-col gap-1.5">
            <Field label="Venue name" value={venue.name} />
            <Field label="Venue address" value={venue.address} />
          </div>
        </section>
        <section aria-label="Event" className="rounded-[10px] border border-gray-200 bg-white p-5">
          <h3 className={SECTION_TITLE}>Event</h3>
          <div className="flex flex-col gap-1.5">
            <Field
              label="Event start date"
              value={eventInfo.start ? formatDate(eventInfo.start) : null}
            />
            <Field
              label="Event end date"
              value={eventInfo.end ? formatDate(eventInfo.end) : null}
            />
            <Field label="Event type" value={eventInfo.type} />
          </div>
        </section>
      </div>

      <MoneyCard money={data.money} currency={data.currency} />
      <PaymentScheduleTable schedule={data.schedule} />
      <PaymentHistoryTable
        eventId={eventId}
        payments={data.payments}
        allocation={data.allocation}
        currency={data.currency}
        timezone={timezone}
        staffNames={data.staffNames}
        canRecordPayment={canRecordPayment}
        recordedByUserUuid={recordedByUserUuid}
        onRecordPayment={onRecordPayment}
      />
    </div>
  );
}
