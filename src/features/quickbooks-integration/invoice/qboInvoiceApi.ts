import { escapeQboQueryValue } from "../customers";
import { parseQboApiResponseText } from "../parseQboApiResponse";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "../util";
import { interpretQboInvoiceError } from "./interpretQboInvoiceError";
import type { QboInvoiceBody } from "./invoiceTypes";

/**
 * The two QuickBooks invoice calls the create route makes: look an invoice up by its number, and
 * create one. Server-only.
 * Spec: docs/specs/qbo-invoice-04-create.md §4
 */

const MINOR_VERSION = 40;

export type ExistingInvoice = {
  id: string;
  number: string;
  customerName: string;
  totalCents: number;
};

export type CreatedQboInvoice = { id: string; docNumber: string };

export type CreateQboInvoiceResult =
  | { ok: true; invoice: CreatedQboInvoice }
  | { ok: false; error: string };

type RawQboInvoice = {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { value?: string; name?: string };
  TotalAmt?: number;
};

/** The invoice in the connection's QuickBooks file with this number, or null. */
export async function findInvoiceByDocNumber(
  connectionId: string,
  docNumber: string,
): Promise<ExistingInvoice | null> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const query = encodeURIComponent(
    `select * from Invoice where DocNumber = '${escapeQboQueryValue(docNumber)}'`,
  );
  const response = await fetch(
    `${getBaseUrl()}/${realmId}/query?query=${query}&minorversion=${MINOR_VERSION}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = data?.Fault?.Error?.[0];
    throw new Error(
      `QuickBooks invoice search failed: ${err?.Detail ?? err?.Message ?? response.status}`,
    );
  }

  const [invoice]: RawQboInvoice[] = data?.QueryResponse?.Invoice ?? [];
  if (!invoice) return null;
  return {
    id: invoice.Id,
    number: invoice.DocNumber ?? docNumber,
    customerName: invoice.CustomerRef?.name ?? "",
    // QuickBooks sends dollars as a number; rounding takes the float noise out of the cents.
    totalCents: Math.round(Number(invoice.TotalAmt ?? 0) * 100),
  };
}

/**
 * Creates the invoice. The `requestId` makes QuickBooks answer a repeated request with the invoice
 * it already made. A refusal comes back as `{ ok: false, error }`; a lost token or a network failure
 * throws.
 */
export async function createQboInvoice(
  connectionId: string,
  body: QboInvoiceBody,
  requestId: string,
): Promise<CreateQboInvoiceResult> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const response = await fetch(
    `${getBaseUrl()}/${realmId}/invoice?minorversion=${MINOR_VERSION}&requestid=${encodeURIComponent(requestId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const data = parseQboApiResponseText(await response.text(), response.status);
  if (!response.ok) return { ok: false, error: interpretQboInvoiceError(data) };

  const invoice = data.Invoice as RawQboInvoice | undefined;
  if (!invoice?.Id) return { ok: false, error: interpretQboInvoiceError(data) };
  return { ok: true, invoice: { id: invoice.Id, docNumber: invoice.DocNumber ?? body.DocNumber } };
}
