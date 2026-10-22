import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";

/**
 * The QuickBooks tax code an admin mapped to a Canadian province for a connection, or null when
 * there is none. Server-only (service role): the invoice route reads every table it needs this way.
 * Spec: docs/specs/qbo-invoice-03a-province-tax-codes.md
 */

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function resolveProvinceTaxCode(
  connectionId: string,
  province: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ProvinceQboTaxCodes")
    .select("qbo_tax_code_id")
    .eq("qbo_connection_uuid", connectionId)
    .eq("province", province)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the province tax code: ${error.message}`);
  return data?.qbo_tax_code_id ?? null;
}

/**
 * The QuickBooks tax code an admin chose, for a connection, to put on a Canadian invoice line that
 * has no tax, or null when there is none. Same service-role read as above.
 * Spec: docs/specs/qbo-invoice-03c-no-tax-code.md
 */
export async function resolveNoTaxCode(connectionId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("QboConnections")
    .select("qbo_no_tax_code_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read the no-tax code: ${error.message}`);
  return data?.qbo_no_tax_code_id ?? null;
}
