import { renderToBuffer } from "@react-pdf/renderer";
import { escapeQboQueryValue } from "../customers";
import { buildQuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { QuotePdfDocument } from "@/features/quotesAndBookings/pdf/QuotePdfDocument";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "../util";

/**
 * Attaches the quote's own PDF to a QuickBooks invoice — to the invoice only, never to an email.
 * Throws on any failure; the caller turns that into a warning (the invoice stays).
 * Spec: docs/specs/qbo-invoice-04-create.md §5, docs/specs/qbo-invoice-05-update.md §5
 */

const MINOR_VERSION = 40;

type QuotePdf = { fileName: string; buffer: Buffer };

async function renderQuotePdf(eventId: string): Promise<QuotePdf> {
  const document = await buildQuoteDocumentData(eventId);
  if (!document) throw new Error("Quote not found");

  // The document already carries the quote's own language (the contact's).
  const buffer = await renderToBuffer(<QuotePdfDocument data={document} />);
  return { fileName: `${document.quoteNumber}.pdf`, buffer };
}

async function uploadPdf(
  connectionId: string,
  qboInvoiceId: string,
  { fileName, buffer }: QuotePdf,
): Promise<void> {
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
    new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
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

export async function attachQuotePdf(
  connectionId: string,
  qboInvoiceId: string,
  eventId: string,
): Promise<void> {
  await uploadPdf(connectionId, qboInvoiceId, await renderQuotePdf(eventId));
}

type RawAttachable = { Id?: string; SyncToken?: string; FileName?: string };

/** Deletes the invoice's attachments named `fileName`; the accountant's own files keep their names. */
async function deleteAttachmentsNamed(
  connectionId: string,
  qboInvoiceId: string,
  fileName: string,
): Promise<void> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  const query = encodeURIComponent(
    `select * from Attachable where AttachableRef.EntityRef.Type = 'Invoice' and AttachableRef.EntityRef.value = '${escapeQboQueryValue(qboInvoiceId)}'`,
  );
  const listed = await fetch(
    `${getBaseUrl()}/${realmId}/query?query=${query}&minorversion=${MINOR_VERSION}`,
    { headers },
  );
  const listData = await listed.json().catch(() => null);
  if (!listed.ok) {
    const fault = listData?.Fault?.Error?.[0];
    throw new Error(
      `QuickBooks attachment search failed: ${fault?.Detail ?? fault?.Message ?? listed.status}`,
    );
  }

  const own = ((listData?.QueryResponse?.Attachable ?? []) as RawAttachable[]).filter(
    (attachable) => attachable.Id && attachable.FileName === fileName,
  );
  for (const attachable of own) {
    const deleted = await fetch(
      `${getBaseUrl()}/${realmId}/attachable?operation=delete&minorversion=${MINOR_VERSION}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ Id: attachable.Id, SyncToken: attachable.SyncToken ?? "0" }),
      },
    );
    if (!deleted.ok) {
      const fault = (await deleted.json().catch(() => null))?.Fault?.Error?.[0];
      throw new Error(
        `QuickBooks attachment delete failed: ${fault?.Detail ?? fault?.Message ?? deleted.status}`,
      );
    }
  }
}

/**
 * Replaces the app's own PDF on the invoice: the file named `{invoice number}.pdf` is deleted, then
 * the new one is attached. The PDF is rendered first, so a render failure keeps the old file.
 */
export async function replaceQuotePdf(
  connectionId: string,
  qboInvoiceId: string,
  eventId: string,
): Promise<void> {
  const pdf = await renderQuotePdf(eventId);
  await deleteAttachmentsNamed(connectionId, qboInvoiceId, pdf.fileName);
  await uploadPdf(connectionId, qboInvoiceId, pdf);
}
