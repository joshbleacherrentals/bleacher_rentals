import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../database.types";

export type AlertEntityType = Database["public"]["Enums"]["alert_entity_type"];

export type AlertPayload = {
  entity_uuid: string | null;
  entity_type: AlertEntityType;
  title: string;
  message: string;
  entity_description: string | null;
};

export type AlertResult = {
  message: string;
  entityDescription: string | null;
};

export type AlertDefinition = {
  title: string;
  entityType: AlertEntityType;
  // `supabase` is optional and currently unused — every definition reads from
  // the local PowerSync DB. Kept in the signature for backwards compatibility.
  evaluate: (
    entityUuid: string,
    supabase?: SupabaseClient<Database>,
  ) => Promise<AlertResult | null>;
  evaluateInMemory?: (context: InMemoryAlertContext) => AlertPayload[];
  recipients: (entityUuid: string, supabase?: SupabaseClient<Database>) => Promise<string[]>;
};

/**
 * What an in-memory alert definition is allowed to read.
 *
 * These are the shapes the PowerSync hooks return, not `Tables<...>`: narrower,
 * more nullable, and with booleans as 0/1. They used to be full Supabase rows
 * fed from Zustand stores that mirrored whole tables over REST — a path that
 * silently truncated at 1000 rows, so `schedulingConflict` was evaluating on a
 * fraction of `BleacherEvents`.
 *
 * `allWorkTrackers` and `allAddresses` were removed with that change: no
 * surviving definition read them. `bleacherTransportation` dropped its
 * in-memory path when `useEventFormTransportationAlerts` replaced it.
 */
export type InMemoryAlertContext = {
  event: import("@/features/eventConfiguration/state/useCurrentEventStore").CurrentEventState;
  allEvents: import("@/features/dashboard/db/hooks/powersync/usePsEvents").PsEventRow[];
  allBleacherEvents: import("@/features/dashboard/db/hooks/powersync/usePsBleacherEvents").PsBleacherEventRow[];
  allBleachers: import("@/features/dashboard/db/hooks/powersync/usePsBleachers").PsBleacherRow[];
};
