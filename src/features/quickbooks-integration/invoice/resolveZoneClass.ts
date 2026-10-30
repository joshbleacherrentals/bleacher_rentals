import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import { buildZoneByState, zoneOfEvent } from "@/features/quotesAndBookings/utils/zoneOfEvent";

/**
 * The QuickBooks Class of a quote: the venue's state → its zone → the zone's class for the
 * connection (`ZoneQboClasses`). Server-only (service role): the invoice route reads every table it
 * needs this way. A quote with no Class is not refused; the warning is passed on to the caller.
 * Spec: docs/specs/qbo-invoice-03b-zone-class.md
 */

export type ClassMissingWarning = {
  code: "class_missing";
  state: string;
  /** `no_zone`: the state is in no zone. `no_class`: its zone has no row for this connection. */
  reason: "no_zone" | "no_class";
};

export type ResolvedZoneClass =
  | { classId: string }
  | { classId: null; warning: ClassMissingWarning };

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function resolveZoneClass(
  connectionId: string,
  venueState: string | null,
): Promise<ResolvedZoneClass> {
  const supabase = getSupabaseAdmin();

  const { data: stateRows, error: stateError } = await supabase
    .from("ZoneStateProvinces")
    .select("state_province, zone_uuid");
  if (stateError) throw new Error(`Failed to read the zone states: ${stateError.message}`);

  const { data: classRows, error: classError } = await supabase
    .from("ZoneQboClasses")
    .select("zone_uuid, qbo_class_id")
    .eq("qbo_connection_uuid", connectionId);
  if (classError) throw new Error(`Failed to read the zone classes: ${classError.message}`);

  const zoneId = zoneOfEvent({ address_state: venueState }, buildZoneByState(stateRows ?? []));
  const state = (venueState ?? "").trim();
  if (!zoneId)
    return { classId: null, warning: { code: "class_missing", state, reason: "no_zone" } };

  const classId = (classRows ?? []).find((row) => row.zone_uuid === zoneId)?.qbo_class_id;
  if (!classId)
    return { classId: null, warning: { code: "class_missing", state, reason: "no_class" } };
  return { classId };
}
