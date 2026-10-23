/**
 * Client-side API functions for QuickBooks integration.
 * All requests go through authenticated Next.js API routes.
 */

export type QboVendor = {
  id: string;
  displayName: string;
  companyName?: string;
  active: boolean;
};

/**
 * Fetches active vendors from QuickBooks for a specific connection.
 */
export async function fetchQboVendors(connectionId: string): Promise<QboVendor[]> {
  const response = await fetch(
    `/api/quickbooks/vendors?connectionId=${encodeURIComponent(connectionId)}`,
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to fetch vendors" }));
    throw new Error(error.error || "Failed to fetch vendors");
  }

  const data = await response.json();
  return data.vendors || [];
}

export type QboClass = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  active: boolean;
};

export type QboAccount = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  accountType: string;
  accountSubType: string;
  active: boolean;
};

/**
 * Fetches active expense accounts from QuickBooks for a specific connection.
 */
export async function fetchQboAccounts(connectionId: string): Promise<QboAccount[]> {
  const response = await fetch(
    `/api/quickbooks/accounts?connectionId=${encodeURIComponent(connectionId)}`,
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to fetch accounts" }));
    throw new Error(error.error || "Failed to fetch accounts");
  }

  const data = await response.json();
  return data.accounts || [];
}

/**
 * Fetches active classes from QuickBooks for a specific connection.
 */
export async function fetchQboClasses(connectionId: string): Promise<QboClass[]> {
  const response = await fetch(
    `/api/quickbooks/classes?connectionId=${encodeURIComponent(connectionId)}`,
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to fetch classes" }));
    throw new Error(error.error || "Failed to fetch classes");
  }

  const data = await response.json();
  return data.classes || [];
}

export type QboConnection = {
  id: string;
  display_name: string;
  realm_id: string | null;
  qbo_tax_code_id: string | null;
  qbo_no_tax_code_id: string | null;
  /** The company's currency, recorded when the connection was authenticated; null until then. */
  currency: string | null;
};

/**
 * Whether a connection is a Canadian company: its recorded currency is exactly CAD. Only such a
 * connection shows the tax code per province and the no-tax code on the QuickBooks page; one with
 * any other currency, or none recorded yet, shows neither.
 * Spec: docs/specs/qbo-invoice-03e-canadian-settings-cad-only.md
 */
export function isCanadianConnection(currency: string | null | undefined): boolean {
  return currency === "CAD";
}

export type QboTaxCode = {
  id: string;
  name: string;
  description: string | null;
  taxable: boolean;
};

/**
 * Fetches all QBO connections.
 */
export async function fetchQboConnections(): Promise<QboConnection[]> {
  const response = await fetch("/api/quickbooks/connections");

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to fetch connections" }));
    throw new Error(error.error || "Failed to fetch connections");
  }

  const data = await response.json();
  return data.connections || [];
}

/**
 * Creates a new QBO connection placeholder and returns the id.
 */
export async function createQboConnectionApi(displayName: string): Promise<string> {
  const response = await fetch("/api/quickbooks/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to create connection" }));
    throw new Error(error.error || "Failed to create connection");
  }

  const data = await response.json();
  return data.connectionId;
}

/**
 * Deletes a QBO connection.
 */
export async function deleteQboConnectionApi(connectionId: string): Promise<void> {
  const response = await fetch(
    `/api/quickbooks/connections?connectionId=${encodeURIComponent(connectionId)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to delete connection" }));
    throw new Error(error.error || "Failed to delete connection");
  }
}

/**
 * Renames a QBO connection's display name.
 */
export async function renameQboConnectionApi(
  connectionId: string,
  displayName: string,
): Promise<void> {
  const response = await fetch("/api/quickbooks/connections", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, displayName }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to rename connection" }));
    throw new Error(error.error || "Failed to rename connection");
  }
}

/**
 * Checks health of a QBO connection.
 */
export async function checkQboConnectionHealth(
  connectionId: string,
): Promise<{ healthy: boolean; error?: string }> {
  const response = await fetch(
    `/api/quickbooks/connections/health?connectionId=${encodeURIComponent(connectionId)}`,
  );

  if (!response.ok) {
    return { healthy: false, error: "Failed to check connection health" };
  }

  return response.json();
}

/**
 * Fetches active tax codes from QuickBooks for a specific connection.
 */
export async function fetchQboTaxCodes(connectionId: string): Promise<QboTaxCode[]> {
  const response = await fetch(
    `/api/quickbooks/tax-codes?connectionId=${encodeURIComponent(connectionId)}`,
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to fetch tax codes" }));
    throw new Error(error.error || "Failed to fetch tax codes");
  }

  const data = await response.json();
  return data.taxCodes || [];
}

/**
 * Sets the default tax code for a QBO connection.
 */
export async function setQboConnectionTaxCodeApi(
  connectionId: string,
  taxCodeId: string | null,
): Promise<void> {
  const response = await fetch("/api/quickbooks/connections", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, taxCodeId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to set tax code" }));
    throw new Error(error.error || "Failed to set tax code");
  }
}

/**
 * Sets the "no tax" code of a QBO connection: the tax code a Canadian invoice line carries when it
 * has no tax (docs/specs/qbo-invoice-03c-no-tax-code.md).
 */
export async function setQboConnectionNoTaxCodeApi(
  connectionId: string,
  taxCodeId: string | null,
): Promise<void> {
  const response = await fetch("/api/quickbooks/connections", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, noTaxCodeId: taxCodeId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to set no-tax code" }));
    throw new Error(error.error || "Failed to set no-tax code");
  }
}

export type ProvinceTaxCodeRow = {
  province: string;
  qbo_tax_code_id: string;
};

/**
 * Fetches the stored QuickBooks tax code of each Canadian province for a connection.
 */
export async function fetchProvinceTaxCodes(connectionId: string): Promise<ProvinceTaxCodeRow[]> {
  const response = await fetch(
    `/api/quickbooks/province-tax-codes?connectionId=${encodeURIComponent(connectionId)}`,
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to fetch province tax codes" }));
    throw new Error(error.error || "Failed to fetch province tax codes");
  }

  const data = await response.json();
  return data.provinceTaxCodes || [];
}

/**
 * Sets the QuickBooks tax code of one Canadian province for a connection (null removes it).
 */
export async function setProvinceTaxCodeApi(
  connectionId: string,
  province: string,
  taxCodeId: string | null,
): Promise<void> {
  const response = await fetch("/api/quickbooks/province-tax-codes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, province, taxCodeId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to set province tax code" }));
    throw new Error(error.error || "Failed to set province tax code");
  }
}
