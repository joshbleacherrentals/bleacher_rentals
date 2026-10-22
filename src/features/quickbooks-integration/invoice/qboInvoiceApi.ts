import { escapeQboQueryValue } from "../customers";
import { parseQboApiResponseText } from "../parseQboApiResponse";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "../util";
import { interpretQboInvoiceError } from "./interpretQboInvoiceError";
import type { QboInvoiceBody } from "./invoiceTypes";

/**
 * The QuickBooks invoice calls the invoice route makes: look an invoice up by its number, create one,
 * read one by its id and update one. Server-only.
 * Spec: docs/specs/qbo-invoice-04-create.md §4, docs/specs/qbo-invoice-05-update.md §4
 */

const MINOR_VERSION = 40;

export type ExistingInvoice = {
  id: string;
  number: string;
  customerName: string;
  totalCents: number;
};

type QboInvoiceUpdateBody = QboInvoiceBody & { Id: string; SyncToken: string; sparse: true };

export type CreatedQboInvoice = { id: string; docNumber: string };

export type CreateQboInvoiceResult =
  | { ok: true; invoice: CreatedQboInvoice }
  | { ok: false; error: string };

/** What an update must carry: the invoice's id and the SyncToken it was read with. */
export type QboInvoiceVersion = { id: string; syncToken: string; docNumber: string };

type RawQboInvoice = {
  Id: string;
  SyncToken?: string;
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

/** Posts an invoice body (a create, or a sparse update when it carries `Id`) and reads the answer. */
async function postInvoice(
  connectionId: string,
  body: QboInvoiceBody | QboInvoiceUpdateBody,
  requestId?: string,
): Promise<CreateQboInvoiceResult> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const requestIdParam = requestId ? `&requestid=${encodeURIComponent(requestId)}` : "";
  const response = await fetch(
    `${getBaseUrl()}/${realmId}/invoice?minorversion=${MINOR_VERSION}${requestIdParam}`,
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

/**
 * Creates the invoice. The `requestId` makes QuickBooks answer a repeated request with the invoice
 * it already made. A refusal comes back as `{ ok: false, error }`; a lost token or a network failure
 * throws.
 */
export function createQboInvoice(
  connectionId: string,
  body: QboInvoiceBody,
  requestId: string,
): Promise<CreateQboInvoiceResult> {
  return postInvoice(connectionId, body, requestId);
}

/**
 * Whether a fault says the object is not there (a deleted invoice). QuickBooks words it as code 610,
 * "Object Not Found"; the text is checked too in case the code differs.
 */
function isObjectNotFound(fault: { code?: string; Message?: string } | undefined): boolean {
  return !!fault && (fault.code === "610" || /object not found/i.test(fault.Message ?? ""));
}

/**
 * The invoice with this id in the connection's QuickBooks file, with the SyncToken an update needs,
 * or null when QuickBooks no longer has it. Any other failure throws.
 */
export async function readQboInvoice(
  connectionId: string,
  invoiceId: string,
): Promise<QboInvoiceVersion | null> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const response = await fetch(
    `${getBaseUrl()}/${realmId}/invoice/${encodeURIComponent(invoiceId)}?minorversion=${MINOR_VERSION}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  const data = parseQboApiResponseText(await response.text(), response.status) as {
    Invoice?: RawQboInvoice;
    Fault?: { Error?: Array<{ code?: string; Message?: string; Detail?: string }> };
    error?: string;
  };

  if (!response.ok) {
    const fault = data.Fault?.Error?.[0];
    if (isObjectNotFound(fault)) return null;
    throw new Error(
      `QuickBooks invoice read failed: ${fault?.Detail ?? fault?.Message ?? data.error ?? response.status}`,
    );
  }

  const invoice = data.Invoice;
  if (!invoice?.Id || invoice.SyncToken === undefined) {
    throw new Error("QuickBooks invoice read failed: the answer carried no invoice.");
  }
  return { id: invoice.Id, syncToken: invoice.SyncToken, docNumber: invoice.DocNumber ?? "" };
}

/**
 * A sparse update of the invoice: the fields of `body` replace the invoice's (its `Line` list as a
 * whole), the fields the app never sets stay. No request id: a stale SyncToken is what makes
 * QuickBooks refuse a second, simultaneous update. A refusal comes back as `{ ok: false, error }`.
 */
export function updateQboInvoice(
  connectionId: string,
  current: Pick<QboInvoiceVersion, "id" | "syncToken">,
  body: QboInvoiceBody,
): Promise<CreateQboInvoiceResult> {
  return postInvoice(connectionId, {
    ...body,
    Id: current.id,
    SyncToken: current.syncToken,
    sparse: true,
  });
}
