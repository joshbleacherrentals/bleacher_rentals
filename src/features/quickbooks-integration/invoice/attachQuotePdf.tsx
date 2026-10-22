import { renderToBuffer } from "@react-pdf/renderer";
import { buildQuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { QuotePdfDocument } from "@/features/quotesAndBookings/pdf/QuotePdfDocument";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "../util";

/**
 * Attaches the quote's own PDF to a QuickBooks invoice — to the invoice only, never to an email.
 * Throws on any failure; the caller turns that into a warning (the invoice stays).
 * Spec: docs/specs/qbo-invoice-04-create.md §5
 */

const MINOR_VERSION = 40;

export async function attachQuotePdf(
  connectionId: string,
  qboInvoiceId: string,
  eventId: string,
): Promise<void> {
  const document = await buildQuoteDocumentData(eventId);
  if (!document) throw new Error("Quote not found");

  // The document already carries the quote's own language (the contact's).
  const pdfBuffer = await renderToBuffer(<QuotePdfDocument data={document} />);
  const fileName = `${document.quoteNumber}.pdf`;

  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const metadata = JSON.stringify({
    AttachableRef: [{ EntityRef: { type: "Invoice", value: qboInvoiceId }, IncludeOnSend: false }],
    ContentType: "application/pdf",
    FileName: fileName,
  });

  const formData = new FormData();
  formData.append(
    "file_metadata_01",
    new Blob([metadata], { type: "application/json" }),
    "attachment.json",
  );
  formData.append(
    "file_content_01",
    new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }),
    fileName,
  );

  const response = await fetch(`${getBaseUrl()}/${realmId}/upload?minorversion=${MINOR_VERSION}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    body: formData,
  });

  const data = await response.json().catch(() => null);
  // An upload can answer 200 with the fault inside the attachable response.
  const fault = response.ok
    ? data?.AttachableResponse?.[0]?.Fault?.Error?.[0]
    : data?.Fault?.Error?.[0];
  if (!response.ok || fault) {
    throw new Error(
      `QuickBooks attachment upload failed: ${fault?.Detail ?? fault?.Message ?? response.status}`,
    );
  }
}
