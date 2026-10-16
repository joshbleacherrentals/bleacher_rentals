"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import type { QuoteDetail } from "../../../../db/fetchQuoteDetail";
import { useEventTypeName } from "../../../../hooks/useEventTypeName";
import { useContractSignature } from "../../../../hooks/useContractSignature";
import { eventTypeDisplay } from "../../../../utils/eventTypeDisplay";
import { formatLostReason } from "../../../../utils/lostReason";
import { ContactHistorySheet } from "../../tabs/ContactHistorySheet";

const STATUS_STYLE: Record<string, string> = {
  booked: "bg-green-100 text-green-800",
  quoted: "bg-yellow-100 text-yellow-800",
  lost: "bg-red-100 text-red-800",
};

function formatDate(d: string | null): string {
  const dt = d ? DateTime.fromISO(d) : null;
  return dt?.isValid ? dt.toFormat("MMM d, yyyy") : "N/A";
}

export function ProjectInfoView({ quote }: { quote: QuoteDetail }) {
  const eventType = useEventTypeName(quote.eventTypeUuid);
  const eventTypeLabel = eventTypeDisplay({
    eventTypeUuid: quote.eventTypeUuid,
    name: eventType.name,
    isLoading: eventType.isLoading,
  });
  const { signature } = useContractSignature(quote.id, quote.termsAndConditionsUuid !== null);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);

  const accountManager = quote.accountManager
    ? `${quote.accountManager.firstName ?? ""} ${quote.accountManager.lastName ?? ""}`.trim()
    : "Not Assigned";

  return (
    <>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2 text-sm">
          {quote.invoiceNumber && (
            <div>
              <span className="text-gray-500">{signature ? "Invoice #:" : "Quote #:"}</span>{" "}
              <span className="font-medium">{quote.invoiceNumber}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Event Name:</span>{" "}
            <span className="font-medium">{quote.eventName}</span>
          </div>
          {eventTypeLabel && (
            <div>
              <span className="text-gray-500">Event Type:</span>{" "}
              <span className="font-medium">{eventTypeLabel}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Status:</span>{" "}
            <span
              className={`font-medium px-2 py-0.5 rounded text-xs ${
                STATUS_STYLE[quote.eventStatus ?? ""] ?? "bg-gray-100 text-gray-800"
              }`}
            >
              {quote.eventStatus ?? "Unknown"}
            </span>
          </div>
          {quote.eventStatus === "lost" && (
            <div>
              <span className="text-gray-500">Lost Reason:</span>{" "}
              <span className="font-medium">
                {formatLostReason(quote.lostReason, quote.lostReasonNote)}
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Account Manager:</span>{" "}
            <span className="font-medium">{accountManager}</span>
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
                  onClick={(e) => {
                    // The whole block opens the editor; this opens the contact's history instead.
                    e.stopPropagation();
                    setContactSheetOpen(true);
                  }}
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

      {quote.contact && (
        <ContactHistorySheet
          contactId={quote.contact.id}
          contactName={`${quote.contact.firstName} ${quote.contact.lastName ?? ""}`.trim()}
          open={contactSheetOpen}
          onOpenChange={setContactSheetOpen}
        />
      )}
    </>
  );
}
