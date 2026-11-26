import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { createLinxupClient } from "@/features/analyticsMcp/server/linxup";
import { runDeliveryProofs, type DeliveryProofSummary } from "./runDeliveryProofs";

/**
 * One proof-of-delivery run with the server's service role and Linxup keys: the daily cron and the
 * Delivery Proof page's Check now both call this. Server only.
 */
export function runDeliveryProofsFromEnv(): Promise<DeliveryProofSummary> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const linxup = createLinxupClient(process.env.LINXUP_API_HOST, process.env.LINXUP_API_TOKEN);
  return runDeliveryProofs(supabase, linxup);
}
