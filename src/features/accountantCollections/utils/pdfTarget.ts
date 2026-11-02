/**
 * Which PDF the Open PDF button of the invoice page opens: the signed one when the event's active
 * signature stored its PDF, otherwise the live quote PDF. `signedPdfPath` is what
 * `ContractSignatures.signed_pdf_path` holds: `<event id>/<signature id>.pdf`, with no bucket
 * prefix, empty when the app saved the signature but the PDF upload failed.
 * docs/specs/accountant-collections-15-open-pdf.md §3.
 */

export type PdfTarget =
  | { kind: "signed"; bucket: "contracts"; path: string }
  | { kind: "quote"; href: string };

export function pdfTarget({
  eventId,
  signedPdfPath,
}: {
  eventId: string;
  signedPdfPath?: string | null;
}): PdfTarget {
  if (signedPdfPath && signedPdfPath.trim() !== "") {
    return { kind: "signed", bucket: "contracts", path: signedPdfPath };
  }
  return { kind: "quote", href: `/api/quotes/${eventId}/pdf` };
}
