"use client";

import { QuoteDetail } from "../../../db/fetchQuoteDetail";
import { useEventLineItems, EventLineItemRow } from "../../../hooks/useEventLineItems";
import { useEventCurrency } from "../../../hooks/useEventCurrency";
import { formatMoney } from "../../../utils/formatMoney";
import { DateTime } from "luxon";
import { useMemo, useState, useEffect } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { ContactHistorySheet } from "./ContactHistorySheet";
import { VenueHistorySheet } from "./VenueHistorySheet";

type SignatureInfo = {
  signerName: string;
  signedAt: string;
} | null;

function formatDate(d: string | null): string {
  if (!d) return "N/A";
  const dt = DateTime.fromISO(d);
  return dt.isValid ? dt.toFormat("MMM d, yyyy") : "N/A";
}

type CategorizedItems = {
  bleachers: EventLineItemRow[];
  logistics: EventLineItemRow[];
  discounts: EventLineItemRow[];
  services: EventLineItemRow[];
};

function categorizeItems(items: EventLineItemRow[]): CategorizedItems {
  const result: CategorizedItems = { bleachers: [], logistics: [], discounts: [], services: [] };
  for (const li of items) {
    const lineTotal = li.valueCents * li.quantity;
    if (li.bleacherTypeUuid) {
      result.bleachers.push(li);
    } else if (lineTotal < 0) {
      result.discounts.push(li);
    } else if (/deliver|pickup|setup|teardown|transport|logistic|fuel|mileage/i.test(li.header)) {
      result.logistics.push(li);
    } else {
      result.services.push(li);
    }
  }
  return result;
}

function ItemSection({
  title,
  items,
  color,
  currency = "USD",
}: {
  title: string;
  items: EventLineItemRow[];
  color?: string;
  currency?: "USD" | "CAD";
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className={`text-xs font-bold uppercase tracking-wide mb-2 ${color ?? "text-gray-500"}`}>
        {title}
      </h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 font-medium text-right">Qty</th>
            <th className="py-2 font-medium text-right">Unit Price</th>
            <th className="py-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((li) => {
            const lineTotal = li.valueCents * li.quantity;
            const isDiscount = lineTotal < 0;
            return (
              <tr key={li.id} className={`border-b ${isDiscount ? "text-red-600" : ""}`}>
                <td className="py-2">
                  <span className="font-medium">{li.header}</span>
                  {li.bleacherTypeName && (
                    <span className="text-gray-400 ml-1 text-xs">({li.bleacherTypeName})</span>
                  )}
                  {li.description && (
                    <span className="block text-xs text-gray-400">{li.description}</span>
                  )}
                </td>
                <td className="py-2 text-right">{li.quantity}</td>
                <td className="py-2 text-right">{formatMoney(li.valueCents, currency)}</td>
                <td className="py-2 text-right font-medium">{formatMoney(lineTotal, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LineItemsTable({
  lineItems,
  taxPercent,
  taxAmountCents,
  currency = "USD",
}: {
  lineItems: EventLineItemRow[];
  taxPercent: number | null;
  taxAmountCents: number | null;
  currency?: "USD" | "CAD";
}) {
  const categories = useMemo(() => categorizeItems(lineItems), [lineItems]);

  const { subtotalCents, discountsCents } = useMemo(() => {
    let sub = 0;
    let disc = 0;
    for (const li of lineItems) {
      const lineTotal = li.valueCents * li.quantity;
      if (lineTotal < 0) {
        disc += lineTotal;
      } else {
        sub += lineTotal;
      }
    }
    return { subtotalCents: sub, discountsCents: disc };
  }, [lineItems]);

  const taxable = subtotalCents + discountsCents;
  const effectiveTax =
    taxAmountCents ?? (taxPercent ? Math.round(taxable * (taxPercent / 100)) : 0);
  const totalCents = taxable + effectiveTax;

  if (lineItems.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center border rounded">
        No line items yet. Edit the quote to add rental items.
      </p>
    );
  }

  return (
    <div>
      <ItemSection title="Bleachers" items={categories.bleachers} currency={currency} />
      <ItemSection title="Logistics" items={categories.logistics} currency={currency} />
      <ItemSection title="Services" items={categories.services} currency={currency} />
      <ItemSection
        title="Discounts"
        items={categories.discounts}
        color="text-red-600"
        currency={currency}
      />

      {/* Totals */}
      <div className="mt-4 flex flex-col items-end gap-1 text-sm">
        <div className="flex gap-8">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-medium w-24 text-right">
            {formatMoney(subtotalCents, currency)}
          </span>
        </div>
        {discountsCents !== 0 && (
          <div className="flex gap-8 text-red-600">
            <span>Discounts</span>
            <span className="font-medium w-24 text-right">
              {formatMoney(discountsCents, currency)}
            </span>
          </div>
        )}
        {effectiveTax > 0 && (
          <div className="flex gap-8">
            <span className="text-gray-500">Tax{taxPercent ? ` (${taxPercent}%)` : ""}</span>
            <span className="font-medium w-24 text-right">
              {formatMoney(effectiveTax, currency)}
            </span>
          </div>
        )}
        <div className="flex gap-8 border-t pt-1 mt-1">
          <span className="font-semibold">Total</span>
          <span className="font-bold w-24 text-right">{formatMoney(totalCents, currency)}</span>
        </div>
      </div>
    </div>
  );
}

function formatSignedAt(iso: string): string {
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat("MMM d, yyyy 'at' h:mm a ZZZZ") : iso;
}

export function ContractTab({ quote }: { quote: QuoteDetail }) {
  const { lineItems, isLoading } = useEventLineItems(quote.id);
  const currency = useEventCurrency(quote.id);
  const [signature, setSignature] = useState<SignatureInfo>(null);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [venueSheetOpen, setVenueSheetOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/contracts/${quote.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.signature) {
          setSignature({
            signerName: data.signature.signerName,
            signedAt: data.signature.signedAt,
          });
        }
      })
      .catch(() => {});
  }, [quote.id]);

  return (
    <div className="space-y-6">
      {/* Action buttons + signature info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href={`/quote/${quote.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-darkBlue border border-darkBlue rounded-sm hover:bg-blue-50 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Show Customer View
          </a>
          <a
            href={`/api/quotes/${quote.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition"
          >
            <FileText className="w-3.5 h-3.5" />
            View PDF
          </a>
        </div>
        {signature && (
          <div className="text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded">
            Signed: {formatSignedAt(signature.signedAt)} by {signature.signerName}
          </div>
        )}
      </div>

      {/* Project Info */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Project Info
        </h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2 text-sm">
            {quote.invoiceNumber && (
              <div>
                <span className="text-gray-500">Invoice #:</span>{" "}
                <span className="font-medium">{quote.invoiceNumber}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Event Name:</span>{" "}
              <span className="font-medium">{quote.eventName}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>{" "}
              <span
                className={`font-medium px-2 py-0.5 rounded text-xs ${
                  quote.eventStatus === "booked"
                    ? "bg-green-100 text-green-800"
                    : quote.eventStatus === "quoted"
                      ? "bg-yellow-100 text-yellow-800"
                      : quote.eventStatus === "lost"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                }`}
              >
                {quote.eventStatus ?? "Unknown"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Account Manager:</span>{" "}
              <span className="font-medium">
                {quote.accountManager
                  ? `${quote.accountManager.firstName ?? ""} ${quote.accountManager.lastName ?? ""}`.trim()
                  : "Not Assigned"}
              </span>
            </div>
            {quote.quoteValidTill && (
              <div>
                <span className="text-gray-500">Quote Valid Till:</span>{" "}
                <span className="font-medium">{formatDate(quote.quoteValidTill)}</span>
              </div>
            )}
          </div>
          <div className="space-y-2 text-sm">
            {quote.contact && (
              <>
                <div>
                  <span className="text-gray-500">Contact:</span>{" "}
                  <button
                    type="button"
                    onClick={() => setContactSheetOpen(true)}
                    className="font-medium text-darkBlue hover:underline"
                  >
                    {quote.contact.firstName} {quote.contact.lastName ?? ""}
                  </button>
                </div>
                {quote.contact.email && (
                  <div>
                    <span className="text-gray-500">Email:</span> <span>{quote.contact.email}</span>
                  </div>
                )}
                {quote.contact.phone && (
                  <div>
                    <span className="text-gray-500">Phone:</span> <span>{quote.contact.phone}</span>
                  </div>
                )}
              </>
            )}
            {quote.financeContact && (
              <>
                <div className="mt-3">
                  <span className="text-gray-500">Finance Contact:</span>{" "}
                  <span className="font-medium text-darkBlue">
                    {quote.financeContact.firstName} {quote.financeContact.lastName ?? ""}
                  </span>
                </div>
                {quote.financeContact.email && (
                  <div>
                    <span className="text-gray-500">Email:</span>{" "}
                    <span>{quote.financeContact.email}</span>
                  </div>
                )}
                {quote.financeContact.phone && (
                  <div>
                    <span className="text-gray-500">Phone:</span>{" "}
                    <span>{quote.financeContact.phone}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Venue */}
      {quote.address && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Venue</h3>
          {quote.venue ? (
            <button
              type="button"
              onClick={() => setVenueSheetOpen(true)}
              className="text-sm font-medium text-darkBlue hover:underline text-left"
            >
              {quote.venue.name}
            </button>
          ) : (
            <p className="text-sm">
              {quote.address.street}
              <br />
              {quote.address.zipPostal ?? ""}
            </p>
          )}
        </div>
      )}

      {/* Dates */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Dates</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block">Event Start</span>
            <span className="font-medium">{formatDate(quote.eventStart)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Event End</span>
            <span className="font-medium">{formatDate(quote.eventEnd)}</span>
          </div>
        </div>
      </div>

      {/* Client-Facing Notes */}
      {(quote.notes || quote.externalNotes) && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
          {quote.externalNotes && (
            <p className="text-sm mb-2 whitespace-pre-wrap">{quote.externalNotes}</p>
          )}
          {quote.notes && !quote.externalNotes && (
            <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
          )}
        </div>
      )}

      {/* Internal Notes */}
      {quote.internalNotes && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
            Internal Notes
          </h3>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-sm whitespace-pre-wrap">{quote.internalNotes}</p>
          </div>
        </div>
      )}

      {/* Line Items (categorized) */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Line Items</h3>
        {isLoading ? (
          <p className="text-sm text-gray-400 py-4 text-center">Loading line items...</p>
        ) : (
          <LineItemsTable
            lineItems={lineItems}
            taxPercent={quote.taxPercent}
            taxAmountCents={quote.taxAmountCents}
            currency={currency}
          />
        )}
      </div>

      {quote.contact && (
        <ContactHistorySheet
          contactId={quote.contact.id}
          contactName={`${quote.contact.firstName} ${quote.contact.lastName ?? ""}`.trim()}
          open={contactSheetOpen}
          onOpenChange={setContactSheetOpen}
        />
      )}

      {quote.venue && (
        <VenueHistorySheet
          venueId={quote.venue.id}
          venueName={quote.venue.name}
          open={venueSheetOpen}
          onOpenChange={setVenueSheetOpen}
        />
      )}
    </div>
  );
}
