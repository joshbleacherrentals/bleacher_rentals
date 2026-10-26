import { escapeQboQueryValue } from "../customers";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "../util";
import type { QboItemRef } from "./invoiceTypes";

/**
 * Finds the QuickBooks Item an invoice line is sold as: the Product/Service assigned to the quote's
 * event type on the Quote Types page, by its id. Server-only; reads only, never creates an Item.
 * Spec: docs/specs/qbo-invoice-12b-use-the-mapping.md
 */

const MINOR_VERSION = 40;

type RawQboItem = { Id: string; Name: string; Description?: string };

export async function findQboItem(connectionId: string, itemId: string): Promise<QboItemRef> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const query = encodeURIComponent(
    `select * from Item where Id = '${escapeQboQueryValue(itemId)}' and Active = true`,
  );
  const response = await fetch(
    `${getBaseUrl()}/${realmId}/query?query=${query}&minorversion=${MINOR_VERSION}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = data?.Fault?.Error?.[0];
    throw new Error(
      `QuickBooks Item search failed: ${err?.Detail ?? err?.Message ?? response.status}`,
    );
  }

  const items: RawQboItem[] = data?.QueryResponse?.Item ?? [];
  if (items.length === 0) {
    throw new Error(
      `The QuickBooks Product/Service assigned to this quote type (id ${itemId}) is not an active Item in this company. Assign another on the Quote Types page.`,
    );
  }
  const [item] = items;
  return { id: item.Id, name: item.Name, description: item.Description?.trim() || null };
}
