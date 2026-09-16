"use client";

import Image from "next/image";
import { QuoteDocumentData } from "./quoteDocumentData";
import type { TrackEvent } from "./useQuoteActivityTracker";
import { formatQuoteDate, formatQuoteDateRange, formatQuoteMoney } from "./quoteFormat";
import { quoteText } from "./quoteStrings";

function companyFullAddress(c: QuoteDocumentData["company"]): string {
  const parts = [c.street];
  if (c.zip) {
    parts.push(`, ${c.zip}`.trim());
  }
  return parts.filter(Boolean).join("");
}

/**
 * Server component — renders the quote as HTML for the public page.
 * Uses the same QuoteDocumentData as PDF and email (single source of truth).
 */
export function QuotePublicView({
  data,
  track,
}: {
  data: QuoteDocumentData;
  track?: (event: TrackEvent) => void;
}) {
  const { currency, language } = data;
  const s = quoteText(language);
  const formatMoney = (cents: number) => formatQuoteMoney(cents, currency, language);
  const formatDate = (d: string) => formatQuoteDate(d, language);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="bg-white border rounded-lg overflow-hidden">
        {/* Header — 3-column: Company | Event Info | Invoice */}
        <div className="px-4 sm:px-8 py-6 border-b grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
          {/* Left: Logo + Company */}
          <div>
            <Image
              src="/NEW-Bleacher-Rentals-logo.png"
              alt="Bleacher Rentals"
              width={60}
              height={60}
              className="mb-2"
            />
            <p className="font-bold text-sm">{data.company.name}</p>
            {data.company.street && (
              <p className="text-xs text-gray-600 whitespace-pre-line">
                {companyFullAddress(data.company)}
              </p>
            )}
            {data.company.phone && (
              <p className="text-xs text-gray-600">
                {s.phonePrefix} {data.company.phone}
              </p>
            )}
            <p className="text-xs text-gray-600">{data.company.email}</p>
            <a
              href={`https://${data.company.website}`}
              className="text-xs text-blue-600 hover:underline"
            >
              {data.company.website}
            </a>
          </div>

          {/* Center: Event Info + Location */}
          <div>
            <p className="font-bold text-sm mb-1">{s.eventInformation}</p>
            <p className="text-sm">{data.venue.name}</p>
            <p className="text-sm text-gray-600">
              {formatQuoteDateRange(data.dates.eventStart, data.dates.eventEnd, language)}
            </p>

            {data.venue.street && (
              <div className="mt-3">
                <p className="font-bold text-sm mb-1">{s.locationVenue}</p>
                <p className="text-sm">{data.venue.name}</p>
                <p className="text-sm text-gray-600">
                  {data.venue.street}
                  {` ${data.venue.zip}`}
                </p>
              </div>
            )}
          </div>

          {/* Right: INVOICE badge */}
          <div className="text-left sm:text-right">
            <p className="text-3xl font-bold text-green-700">{s.invoiceBadge}</p>
            <p className="text-sm mt-1">{s.invoiceNumber(data.quoteNumber)}</p>
            {data.poNumber && <p className="text-sm">{s.poNumberShort(data.poNumber)}</p>}
          </div>
        </div>

        {/* Contact + Customer company row */}
        {(data.contact || data.customerCompany) && (
          <div className="px-4 sm:px-8 py-4 border-b grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.contact && (
              <div>
                <p className="font-bold text-sm mb-1">{s.contact}</p>
                <p className="text-sm">{data.contact.name}</p>
                {data.contact.email && (
                  <p className="text-sm text-gray-600">{data.contact.email}</p>
                )}
                {data.contact.phone && (
                  <p className="text-sm text-gray-600">{data.contact.phone}</p>
                )}
              </div>
            )}
            {data.customerCompany && (
              <div>
                <p className="font-bold text-sm mb-1">{s.customerCompany}</p>
                <p className="text-sm">{data.customerCompany.name}</p>
                {data.customerCompany.address && (
                  <p className="text-sm text-gray-600">{data.customerCompany.address}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="px-4 sm:px-8 py-6 space-y-8">
          {/* Line Items Table */}
          <div>
            {/* Rental Items header bar */}
            <div className="flex justify-between items-center bg-darkBlue text-white px-3 py-2 rounded-t text-sm font-semibold">
              <span>{s.rentalItems}</span>
              <span>
                {formatDate(data.dates.eventStart)} - {formatDate(data.dates.eventEnd)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b text-gray-500 text-xs uppercase">
                    <th className="px-3 py-2 text-left font-medium">{s.colDescription}</th>
                    <th className="px-3 py-2 text-center font-medium w-16">{s.colQty}</th>
                    <th className="px-3 py-2 text-right font-medium w-24">{s.colUnit}</th>
                    <th className="px-3 py-2 text-right font-medium w-24">{s.colTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lineItems.map((item, i) => (
                    <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                      <td className="px-3 py-2 border-b border-gray-100">
                        <span className="font-medium">{item.label}</span>
                        {item.description && (
                          <span className="block text-xs text-gray-500">{item.description}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-100 text-center">{item.qty}</td>
                      <td className="px-3 py-2 border-b border-gray-100 text-right">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-100 text-right font-semibold">
                        {formatMoney(item.total)}
                      </td>
                    </tr>
                  ))}
                  {data.lineItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                        {s.noItems}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Make checks payable + Totals summary side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Make checks payable */}
            <div className="bg-gray-50 rounded-lg p-5 text-sm text-center">
              <p className="font-bold mb-2">{s.makeChecksPayableTo}</p>
              <p>{data.company.name}</p>
              {data.company.street && (
                <p className="whitespace-pre-line">{companyFullAddress(data.company)}</p>
              )}
              <p className="font-bold mb-2">{s.memoInvoice(data.quoteNumber)}</p>
              <p className="font-bold mb-2">{s.eTransferNote}</p>
            </div>

            {/* Right: Totals box */}
            <div>
              <div className="bg-darkBlue text-white px-4 py-2 rounded-t text-sm font-semibold">
                {s.totalsHeading}
              </div>
              <div className="border border-t-0 rounded-b p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{s.subtotal}</span>
                  <span className="font-medium">{formatMoney(data.subtotalCents)}</span>
                </div>
                {data.discountsCents !== 0 && (
                  <>
                    <div className="flex justify-between text-red-600">
                      <span>{s.discounts}</span>
                      <span className="font-medium">{formatMoney(data.discountsCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{s.subtotalAfterDiscount}</span>
                      <span className="font-medium">
                        {formatMoney(data.subtotalCents + data.discountsCents)}
                      </span>
                    </div>
                  </>
                )}
                {data.taxAmountCents !== 0 && (
                  <div className="flex justify-between">
                    <span>{data.taxPercent ? s.taxWithPercent(data.taxPercent) : s.tax}</span>
                    <span className="font-medium">{formatMoney(data.taxAmountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>{s.totalWithAsterisk}</span>
                  <span>{formatMoney(data.totalCents)}</span>
                </div>
              </div>

              {/* Payment schedule under totals */}
              {data.paymentSchedule.length > 0 && (
                <div className="mt-4 space-y-2 text-sm">
                  {data.paymentSchedule.map((p, i) => {
                    const isFirst = i === 0;
                    const isLast = i === data.paymentSchedule.length - 1;
                    const label = isFirst
                      ? s.dueNow
                      : isLast
                        ? s.finalDueOn(formatDate(p.dueDate))
                        : s.dueOn(formatDate(p.dueDate));
                    return (
                      <div key={i} className="flex justify-between">
                        <span>{label}</span>
                        <span className="font-medium">{formatMoney(p.amountCents)}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between font-bold border-t pt-2">
                    <span>{s.remainingBalance}</span>
                    <span>{formatMoney(data.totalCents)}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{s.convenienceFeesNote}</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {data.clientNotes && (
            <div>
              <h3 className="text-sm font-bold text-darkBlue mb-2">{s.notes}</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{data.clientNotes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-8 py-4 bg-gray-50 border-t flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">
            {data.company.name} &middot; {s.invoiceNumber(data.quoteNumber)}
          </p>
          <a
            href={`/api/quotes/${data.eventId}/pdf?lang=${language}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track?.({ action_type: "client_pdf_download" })}
            className="px-4 py-2 text-sm font-medium text-darkBlue border border-darkBlue rounded-sm hover:bg-blue-50 transition"
          >
            {s.downloadPdf}
          </a>
        </div>
      </div>
    </div>
  );
}
