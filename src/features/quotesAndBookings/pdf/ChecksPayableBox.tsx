import type { QuoteLanguage } from "./quoteLanguage";
import { quoteText } from "./quoteStrings";

/**
 * The "Make checks payable to" box on the customer's quote. Shared with the sales office form's
 * live preview, so what the person sees while typing is the same markup the customer gets.
 *
 * `paymentInfo` is the office's own free text (e-transfer details, "ACH info is attached", …).
 * Nothing extra is shown when it is blank.
 */
export function ChecksPayableBox({
  company,
  quoteNumber,
  paymentInfo,
  language,
  highlight = false,
}: {
  company: { name: string; street: string; zip: string };
  quoteNumber: string;
  paymentInfo: string | null;
  language: QuoteLanguage;
  /** Pulses a red outline round the box — used by the sales office form's live preview. */
  highlight?: boolean;
}) {
  const s = quoteText(language);
  const address = [company.street, company.zip ? `, ${company.zip}`.trim() : ""]
    .filter(Boolean)
    .join("");
  const extra = paymentInfo?.trim();

  return (
    <div
      className={`bg-gray-50 rounded-lg p-5 text-sm text-center ${highlight ? "animate-payment-box-pulse" : ""}`}
    >
      <p className="font-bold mb-2">{s.makeChecksPayableTo}</p>
      <p>{company.name}</p>
      {company.street && <p className="whitespace-pre-line">{address}</p>}
      <p className="font-bold mb-2">{s.memoInvoice(quoteNumber)}</p>
      {extra && <p className="font-bold mb-2 whitespace-pre-line">{extra}</p>}
    </div>
  );
}
