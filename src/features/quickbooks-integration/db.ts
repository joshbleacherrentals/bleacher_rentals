import { createServiceRoleClient } from "@/utils/supabase/server";
import { createServerSupabaseClient } from "@/utils/supabase/getClerkSupabaseServerClient";

// ─────────────────────────────────────────────────────────────
// Token functions — use service_role because:
//   1. Encrypted tokens never leave the server
//   2. Account managers need QBO tokens (via create-bill) but
//      QboConnections RLS is admin-only
// ─────────────────────────────────────────────────────────────

/**
 * Stores encrypted QuickBooks OAuth tokens for a specific connection.
 */
export async function setQboTokens(connectionId: string, encryptedTokens: string): Promise<void> {
  const supabase = await createServiceRoleClient();

  const { error } = await supabase
    .from("QboConnections")
    .update({ encrypted_token_value: encryptedTokens })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to update QBO tokens:", error);
    throw new Error(`Failed to update QBO tokens: ${error.message}`);
  }
}

/**
 * Retrieves encrypted QuickBooks OAuth tokens for a specific connection.
 */
export async function getQboTokens(connectionId: string): Promise<string | null> {
  const supabase = await createServiceRoleClient();

  const { data, error } = await supabase
    .from("QboConnections")
    .select("encrypted_token_value")
    .eq("id", connectionId)
    .single();

  if (error) {
    console.error("Failed to fetch QBO tokens:", error);
    throw new Error(`Failed to fetch QBO tokens: ${error.message}`);
  }

  return data?.encrypted_token_value ?? null;
}

/**
 * Sets the realm_id on a QBO connection after OAuth completes.
 * Uses service_role because this is called from the OAuth callback
 * which may not have a user session context.
 */
export async function setQboConnectionRealmId(
  connectionId: string,
  realmId: string,
): Promise<void> {
  const supabase = await createServiceRoleClient();

  // Check if another connection already uses this realm_id
  const { data: existing } = await supabase
    .from("QboConnections")
    .select("id, display_name")
    .eq("realm_id", realmId)
    .neq("id", connectionId)
    .maybeSingle();

  if (existing) {
    throw new Error(
      `This QuickBooks company is already connected as "${existing.display_name}". Each QuickBooks company can only be linked once.`,
    );
  }

  const { error } = await supabase
    .from("QboConnections")
    .update({ realm_id: realmId })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to set realm_id:", error);
    throw new Error(`Failed to set realm_id: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// CRUD functions — use anon-key client so RLS enforces access.
// QboConnections is admin-only in RLS, so only admins can call
// these successfully.
// ─────────────────────────────────────────────────────────────

/**
 * Creates a new QBO connection with a display name and encrypted tokens.
 * Returns the new connection's UUID.
 */
export async function createQboConnection(
  displayName: string,
  encryptedTokens: string,
): Promise<string> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("QboConnections")
    .insert({ display_name: displayName, encrypted_token_value: encryptedTokens })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create QBO connection:", error);
    throw new Error(`Failed to create QBO connection: ${error.message}`);
  }

  return data.id;
}

/**
 * Creates a placeholder QBO connection (before OAuth flow).
 * The encrypted_token_value is set to a placeholder that will be replaced after auth.
 */
export async function createQboConnectionPlaceholder(displayName: string): Promise<string> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("QboConnections")
    .insert({ display_name: displayName, encrypted_token_value: "__pending__" })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create QBO connection:", error);
    throw new Error(`Failed to create QBO connection: ${error.message}`);
  }

  return data.id;
}

/**
 * Deletes a QBO connection by ID.
 */
export async function deleteQboConnection(connectionId: string): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase.from("QboConnections").delete().eq("id", connectionId);

  if (error) {
    console.error("Failed to delete QBO connection:", error);
    throw new Error(`Failed to delete QBO connection: ${error.message}`);
  }
}

/**
 * Updates the display_name of a QBO connection.
 */
export async function updateQboConnectionDisplayName(
  connectionId: string,
  displayName: string,
): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("QboConnections")
    .update({ display_name: displayName })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to update QBO connection display name:", error);
    throw new Error(`Failed to update display name: ${error.message}`);
  }
}

/**
 * Fetches all QBO connections (id, display_name, realm_id, qbo_tax_code_id, qbo_no_tax_code_id —
 * no tokens).
 */
export async function getAllQboConnections(): Promise<
  {
    id: string;
    display_name: string;
    realm_id: string | null;
    qbo_tax_code_id: string | null;
    qbo_no_tax_code_id: string | null;
    currency: string | null;
  }[]
> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("QboConnections")
    .select("id, display_name, realm_id, qbo_tax_code_id, qbo_no_tax_code_id, currency")
    .order("display_name");

  if (error) {
    console.error("Failed to fetch QBO connections:", error);
    throw new Error(`Failed to fetch QBO connections: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Sets the currency for a QBO connection (fetched from QBO CompanyInfo).
 */
export async function setQboConnectionCurrency(
  connectionId: string,
  currency: string,
): Promise<void> {
  const supabase = await createServiceRoleClient();

  const { error } = await supabase
    .from("QboConnections")
    .update({ currency })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to set QBO connection currency:", error);
    throw new Error(`Failed to set currency: ${error.message}`);
  }
}

/**
 * Sets the default tax code for a QBO connection.
 */
export async function updateQboConnectionTaxCode(
  connectionId: string,
  taxCodeId: string | null,
): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("QboConnections")
    .update({ qbo_tax_code_id: taxCodeId })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to update QBO connection tax code:", error);
    throw new Error(`Failed to update tax code: ${error.message}`);
  }
}

/**
 * Sets the "no tax" code of a QBO connection: the tax code a Canadian invoice line carries when it
 * has no tax (docs/specs/qbo-invoice-03c-no-tax-code.md). Uses the signed-in user's token, so the
 * policies of QboConnections decide who may call it.
 */
export async function updateQboConnectionNoTaxCode(
  connectionId: string,
  taxCodeId: string | null,
): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from("QboConnections")
    .update({ qbo_no_tax_code_id: taxCodeId })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to update QBO connection no-tax code:", error);
    throw new Error(`Failed to update no-tax code: ${error.message}`);
  }
}

/**
 * Reads the QuickBooks tax code of each Canadian province for a connection
 * (docs/specs/qbo-invoice-03a-province-tax-codes.md). RLS lets only an admin read the table.
 */
export async function getProvinceTaxCodes(
  connectionId: string,
): Promise<{ province: string; qbo_tax_code_id: string }[]> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("ProvinceQboTaxCodes")
    .select("province, qbo_tax_code_id")
    .eq("qbo_connection_uuid", connectionId)
    .order("province");

  if (error) {
    console.error("Failed to fetch province tax codes:", error);
    throw new Error(`Failed to fetch province tax codes: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Sets the QuickBooks tax code of one province for a connection, or removes it when the id is null.
 */
export async function setProvinceTaxCode(
  connectionId: string,
  province: string,
  taxCodeId: string | null,
): Promise<void> {
  const supabase = createServerSupabaseClient();

  const { error } =
    taxCodeId === null
      ? await supabase
          .from("ProvinceQboTaxCodes")
          .delete()
          .eq("qbo_connection_uuid", connectionId)
          .eq("province", province)
      : await supabase
          .from("ProvinceQboTaxCodes")
          .upsert(
            { qbo_connection_uuid: connectionId, province, qbo_tax_code_id: taxCodeId },
            { onConflict: "qbo_connection_uuid,province" },
          );

  if (error) {
    console.error("Failed to set province tax code:", error);
    throw new Error(`Failed to set province tax code: ${error.message}`);
  }
}
