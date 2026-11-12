import { ExternalLink } from "lucide-react";
import { HEADER_BUTTON } from "@/features/accountantCollections/components/OpenPdfButton";
import { openApHref } from "@/features/accountantCollections/utils/invoiceUrl";

/**
 * Open AR in the header of the quote card: a plain link to the booking's invoice page (its
 * Information tab) in a new tab, so the card keeps its place. It looks like the header buttons of
 * the invoice page, the mirror of that page's Open Q/I. Whether to draw it is the caller's call
 * (`can.openAp`): this component does not ask who the user is.
 */
export function OpenApButton({ eventId }: { eventId: string }) {
  return (
    <a
      href={openApHref(eventId)}
      target="_blank"
      rel="noopener noreferrer"
      title="Opens the invoice page of this event in a new tab"
      className={`${HEADER_BUTTON} shrink-0`}
    >
      <ExternalLink className="size-4" aria-hidden />
      Open AR
    </a>
  );
}
