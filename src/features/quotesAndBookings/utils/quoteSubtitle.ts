import type { QuoteDetail } from "../db/fetchQuoteDetail";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The venue's name, else the street, then " | " and the zip or postal code, whichever of them exist. */
function placeLabel(quote: Pick<QuoteDetail, "venue" | "address">): string {
  const name = quote.venue?.name.trim() || quote.address?.street.trim();
  const zip = quote.address?.zipPostal?.trim();
  return [name, zip].filter(Boolean).join(" | ");
}

/**
 * The line under the quote's title: "Status • Contact name • Venue". A part the quote does not
 * have is left out, with its separator.
 */
export function quoteSubtitle(
  quote: Pick<QuoteDetail, "eventStatus" | "contact" | "venue" | "address">,
): string {
  const contactName = [quote.contact?.firstName, quote.contact?.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return [quote.eventStatus ? capitalize(quote.eventStatus) : "", contactName, placeLabel(quote)]
    .filter(Boolean)
    .join(" • ");
}
