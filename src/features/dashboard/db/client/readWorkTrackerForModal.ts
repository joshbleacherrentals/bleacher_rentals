"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import { Tables } from "../../../../../database.types";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import type { Selectable } from "kysely";
import { startTrace } from "@/lib/perf/perfTrace";

/**
 * Local-first replacement for `fetchWorkTrackerByUuid`.
 *
 * The modal used to make three sequential Supabase round-trips for rows
 * PowerSync already holds on the device — measured at 8.31s on the first open of
 * a session, with only two local reads in the whole trace. Nothing here needs
 * the network: WorkTrackers and Addresses are both synced tables.
 */

/** The row exactly as the local table stores it — booleans still 0/1. */
type LocalWorkTracker = Selectable<PowerSyncDB["WorkTrackers"]>;
type LocalAddress = Selectable<PowerSyncDB["Addresses"]>;

/**
 * PowerSync stores booleans as 0/1 (SQLite has no boolean type), but the modal's
 * props are typed `boolean`. Only two columns are affected.
 */
export function toWorkTrackerRow(row: LocalWorkTracker): Tables<"WorkTrackers"> {
  return {
    ...row,
    setup_required: row.setup_required === 1,
    teardown_required: row.teardown_required === 1,
  } as unknown as Tables<"WorkTrackers">;
}

export async function readWorkTrackerForModal(uuid: string): Promise<{
  workTracker: Tables<"WorkTrackers"> | null;
  pickupAddress: Tables<"Addresses"> | null;
  dropoffAddress: Tables<"Addresses"> | null;
}> {
  const trace = startTrace("readWorkTrackerForModal (local)");

  const rows = await typedGetAll(
    db.selectFrom("WorkTrackers").selectAll().where("id", "=", uuid).limit(1).compile(),
    expect<LocalWorkTracker>(),
  );
  trace.mark("tracker");

  const local = rows[0];
  if (!local) {
    trace.end({ workTrackerUuid: uuid, found: false });
    return { workTracker: null, pickupAddress: null, dropoffAddress: null };
  }

  const workTracker = toWorkTrackerRow(local);

  // Both addresses in one query rather than one round-trip each.
  const addressUuids = [workTracker.pickup_address_uuid, workTracker.dropoff_address_uuid].filter(
    Boolean,
  ) as string[];

  let addresses: Tables<"Addresses">[] = [];
  if (addressUuids.length > 0) {
    addresses = (await typedGetAll(
      db.selectFrom("Addresses").selectAll().where("id", "in", addressUuids).compile(),
      expect<LocalAddress>(),
    )) as unknown as Tables<"Addresses">[];
  }
  trace.mark("addresses");

  const byUuid = new Map(addresses.map((a) => [a.id, a]));

  trace.end({ workTrackerUuid: uuid, found: true });

  return {
    workTracker,
    pickupAddress: workTracker.pickup_address_uuid
      ? (byUuid.get(workTracker.pickup_address_uuid) ?? null)
      : null,
    dropoffAddress: workTracker.dropoff_address_uuid
      ? (byUuid.get(workTracker.dropoff_address_uuid) ?? null)
      : null,
  };
}
