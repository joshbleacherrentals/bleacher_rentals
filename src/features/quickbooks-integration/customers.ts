import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../database.types";
import { getBaseUrl, getQboAccessTokenAndRealmId } from "./util";
import type { QboErrorData } from "./interpretQboBillError";

/**
 * Finds or creates the QuickBooks customer an invoice is billed to.
 * Server-only: reads and writes the ContactQboCustomers link with the service role (no policy,
 * not synced) and talks to the QuickBooks API of one connection.
 * Spec: docs/specs/qbo-invoice-02-customer.md
 */

export type QboCustomerSummary = {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
};

export type BilledContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  companyName: string | null;
};

export type CustomerChoice = { kind: "existing"; customerId: string } | { kind: "new" };

export type CustomerResolution =
  | { kind: "customer"; customerId: string; how: "linked" | "found" | "chosen" | "created" }
  | { kind: "choose"; candidates: QboCustomerSummary[] };

type QboContext = { accessToken: string; realmId: string; baseUrl: string };

type RawQboCustomer = {
  Id: string;
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  Active?: boolean;
};

const MINOR_VERSION = 40;
const QBO_OBJECT_NOT_FOUND = "610";
const QBO_DUPLICATE_NAME = "6240";
const PG_UNIQUE_VIOLATION = "23505";

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** A value goes inside single quotes in a QuickBooks query: escape \ and ' (O'Brien). */
export function escapeQboQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getContext(connectionId: string): Promise<QboContext> {
  const { accessToken, realmId } = await getQboAccessTokenAndRealmId(connectionId);
  return { accessToken, realmId, baseUrl: getBaseUrl() };
}

function toSummary(c: RawQboCustomer): QboCustomerSummary {
  return {
    id: c.Id,
    displayName: c.DisplayName,
    companyName: c.CompanyName || null,
    email: c.PrimaryEmailAddr?.Address || null,
  };
}

function qboFault(data: QboErrorData | null) {
  return data?.Fault?.Error?.[0];
}

async function queryCustomers(ctx: QboContext, where: string): Promise<RawQboCustomer[]> {
  const query = encodeURIComponent(`select * from Customer where ${where} and Active = true`);
  const response = await fetch(
    `${ctx.baseUrl}/${ctx.realmId}/query?query=${query}&minorversion=${MINOR_VERSION}`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: "application/json" } },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = qboFault(data);
    throw new Error(
      `QuickBooks customer search failed: ${err?.Detail ?? err?.Message ?? response.status}`,
    );
  }
  return data?.QueryResponse?.Customer ?? [];
}

/** The customer by QuickBooks id, or null when this connection has no such customer. */
async function readCustomer(ctx: QboContext, id: string): Promise<RawQboCustomer | null> {
  const response = await fetch(
    `${ctx.baseUrl}/${ctx.realmId}/customer/${encodeURIComponent(id)}?minorversion=${MINOR_VERSION}`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: "application/json" } },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = qboFault(data);
    if (err?.code === QBO_OBJECT_NOT_FOUND) return null;
    throw new Error(
      `QuickBooks customer read failed: ${err?.Detail ?? err?.Message ?? response.status}`,
    );
  }
  return data?.Customer ?? null;
}

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

async function findCandidates(
  ctx: QboContext,
  contact: BilledContact,
): Promise<QboCustomerSummary[]> {
  const found = new Map<string, QboCustomerSummary>();

  if (contact.email?.trim()) {
    const rows = await queryCustomers(
      ctx,
      `PrimaryEmailAddr = '${escapeQboQueryValue(contact.email.trim())}'`,
    );
    for (const c of rows) {
      if (sameText(c.PrimaryEmailAddr?.Address, contact.email)) found.set(c.Id, toSummary(c));
    }
  }

  if (contact.firstName.trim()) {
    const last = contact.lastName?.trim();
    const where =
      `GivenName = '${escapeQboQueryValue(contact.firstName.trim())}'` +
      (last ? ` and FamilyName = '${escapeQboQueryValue(last)}'` : "");
    const rows = await queryCustomers(ctx, where);
    for (const c of rows) {
      // Without a last name the contact is matched on the given name alone, so a customer that
      // has a family name is another person.
      if (sameText(c.GivenName, contact.firstName) && sameText(c.FamilyName, contact.lastName)) {
        found.set(c.Id, toSummary(c));
      }
    }
  }

  return [...found.values()];
}

async function create(ctx: QboContext, contact: BilledContact): Promise<QboCustomerSummary> {
  const lastName = contact.lastName?.trim();
  const displayName = [contact.firstName.trim(), lastName].filter(Boolean).join(" ");
  const body = {
    GivenName: contact.firstName.trim(),
    ...(lastName ? { FamilyName: lastName } : {}),
    DisplayName: displayName,
    ...(contact.companyName ? { CompanyName: contact.companyName } : {}),
    ...(contact.email ? { PrimaryEmailAddr: { Address: contact.email } } : {}),
  };

  const response = await fetch(
    `${ctx.baseUrl}/${ctx.realmId}/customer?minorversion=${MINOR_VERSION}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = qboFault(data);
    if (err?.code === QBO_DUPLICATE_NAME) {
      throw new Error(
        `QuickBooks already has a customer, vendor or employee named ${displayName}; create the customer by hand and try again`,
      );
    }
    throw new Error(
      `QuickBooks customer create failed: ${err?.Detail ?? err?.Message ?? response.status}`,
    );
  }
  return toSummary(data.Customer);
}

export async function findCustomerCandidates(
  connectionId: string,
  contact: BilledContact,
): Promise<QboCustomerSummary[]> {
  return findCandidates(await getContext(connectionId), contact);
}

/** A flat customer: named after the person, the company in its Company name field. */
export async function createCustomer(
  connectionId: string,
  contact: BilledContact,
): Promise<QboCustomerSummary> {
  return create(await getContext(connectionId), contact);
}

/**
 * Remembers the customer for this contact and connection. When another attempt linked the contact
 * first (unique index), that row wins and its customer is returned.
 */
async function link(contactId: string, connectionId: string, customerId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("ContactQboCustomers").insert({
    contact_uuid: contactId,
    qbo_connection_uuid: connectionId,
    qbo_customer_id: customerId,
  });
  if (!error) return customerId;
  if (error.code !== PG_UNIQUE_VIOLATION) {
    throw new Error(`Failed to link the QuickBooks customer: ${error.message}`);
  }
  const winner = await readLink(contactId, connectionId);
  if (!winner) throw new Error(`Failed to link the QuickBooks customer: ${error.message}`);
  return winner;
}

async function readLink(contactId: string, connectionId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ContactQboCustomers")
    .select("qbo_customer_id")
    .eq("contact_uuid", contactId)
    .eq("qbo_connection_uuid", connectionId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the QuickBooks customer link: ${error.message}`);
  return data?.qbo_customer_id ?? null;
}

async function deleteLink(contactId: string, connectionId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("ContactQboCustomers")
    .delete()
    .eq("contact_uuid", contactId)
    .eq("qbo_connection_uuid", connectionId);
  if (error) throw new Error(`Failed to drop the QuickBooks customer link: ${error.message}`);
}

/**
 * The QuickBooks customer an invoice for this contact is billed to:
 * linked → (stale link dropped) → chosen / new → found / choose / created.
 * Writes the link row; never writes Events.
 */
export async function resolveInvoiceCustomer(
  connectionId: string,
  contact: BilledContact,
  choice?: CustomerChoice,
): Promise<CustomerResolution> {
  const ctx = await getContext(connectionId);

  const linkedId = await readLink(contact.id, connectionId);
  if (linkedId) {
    const existing = await readCustomer(ctx, linkedId);
    if (existing && existing.Active !== false) {
      return { kind: "customer", customerId: linkedId, how: "linked" };
    }
    await deleteLink(contact.id, connectionId);
  }

  if (choice?.kind === "existing") {
    const existing = await readCustomer(ctx, choice.customerId);
    if (!existing) {
      throw new Error(
        `QuickBooks has no customer with id ${choice.customerId} in this connection.`,
      );
    }
    const customerId = await link(contact.id, connectionId, existing.Id);
    return { kind: "customer", customerId, how: "chosen" };
  }

  if (choice?.kind === "new") {
    const created = await create(ctx, contact);
    const customerId = await link(contact.id, connectionId, created.id);
    return { kind: "customer", customerId, how: "created" };
  }

  const candidates = await findCandidates(ctx, contact);
  if (candidates.length > 1) return { kind: "choose", candidates };
  if (candidates.length === 1) {
    const customerId = await link(contact.id, connectionId, candidates[0].id);
    return { kind: "customer", customerId, how: "found" };
  }
  const created = await create(ctx, contact);
  const customerId = await link(contact.id, connectionId, created.id);
  return { kind: "customer", customerId, how: "created" };
}
