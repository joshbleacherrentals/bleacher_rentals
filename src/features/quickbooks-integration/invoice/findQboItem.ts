import { escapeQboQueryValue } from "../customers";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "../util";
import type { QboItemRef } from "./invoiceTypes";

/**
 * Finds the QuickBooks Item an invoice line is sold as: `Bleacher Rental - {event type}`.
 * Server-only; reads only, never creates an Item.
 * Spec: docs/specs/qbo-invoice-03-payload.md
 */

const MINOR_VERSION = 40;

type RawQboItem = { Id: string; Name: string; Description?: string };

export async function findQboItem(
  connectionId: string,
  eventTypeName: string,
): Promise<QboItemRef> {
  const name = `Bleacher Rental - ${eventTypeName}`;
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);

  const query = encodeURIComponent(
    `select * from Item where Name = '${escapeQboQueryValue(name)}' and Active = true`,
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
    throw new Error(`QuickBooks has no active Item named "${name}" in this company`);
  }
  if (items.length > 1) {
    throw new Error(`QuickBooks has more than one active Item named "${name}" in this company`);
  }
  const [item] = items;
  return { id: item.Id, name: item.Name, description: item.Description?.trim() || null };
}
