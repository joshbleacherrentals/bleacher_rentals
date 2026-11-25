"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useTripsNeeded } from "@/features/autoWorkTrackers/hooks/useTripsNeeded";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { weekEndOf } from "@/features/autoWorkTrackers/utils/week";
import { addressesQuery, eventNamesQuery, weekWorkTrackersQuery } from "../db/bleacherMoveQueries";
import type { StoredAddress } from "../utils/addressCheck";
import {
  buildBleacherMoves,
  moveAddressUuids,
  type BleacherMove,
  type WeekWorkTracker,
} from "../utils/bleacherMoves";

type TrackerRow = {
  id: string;
  bleacher_uuid: string | null;
  bleacher_number: number | null;
  date: string | null;
  status: string | null;
  pickup_address_uuid: string | null;
  dropoff_address_uuid: string | null;
  pickup_event_uuid: string | null;
  dropoff_event_uuid: string | null;
  pickup_street: string | null;
  dropoff_street: string | null;
};

// Flat, not `StoredAddress & { id }`: expect<Row>() compares row types by identity.
type AddressRow = {
  id: string;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
};

/**
 * The zone's bleacher moves for the week (see buildBleacherMoves) with both addresses checked, and
 * the names of the events they go between, from the local database. No zone: no moves.
 */
export function useBleacherMoves(
  zoneId: string,
  weekStart: string,
): { moves: BleacherMove[]; eventNames: Map<string, string>; isLoading: boolean } {
  const weekEnd = weekEndOf(weekStart);
  const needed = useTripsNeeded(zoneId, weekStart);

  const trackersCompiled = useMemo(
    () => weekWorkTrackersQuery(zoneId, weekStart, weekEnd),
    [zoneId, weekStart, weekEnd],
  );
  const trackers = useTypedQuery(trackersCompiled, expect<TrackerRow>());

  const workTrackers = useMemo<WeekWorkTracker[]>(
    () =>
      (trackers.data ?? []).flatMap((r) => {
        const date = timestampToDate(r.date);
        if (!r.bleacher_uuid || !date) return [];
        return [
          {
            workTrackerUuid: r.id,
            bleacherUuid: r.bleacher_uuid,
            bleacherNumber: r.bleacher_number,
            date,
            status: r.status,
            pickup: {
              addressUuid: r.pickup_address_uuid,
              street: r.pickup_street,
              eventUuid: r.pickup_event_uuid,
            },
            dropoff: {
              addressUuid: r.dropoff_address_uuid,
              street: r.dropoff_street,
              eventUuid: r.dropoff_event_uuid,
            },
          },
        ];
      }),
    [trackers.data],
  );

  const addressIds = useMemo(
    () => moveAddressUuids(needed.trips, workTrackers),
    [needed.trips, workTrackers],
  );
  const addressesCompiled = useMemo(() => addressesQuery(addressIds), [addressIds]);
  const addressRows = useTypedQuery(addressesCompiled, expect<AddressRow>());

  const eventIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of needed.trips) ids.add(t.fromEventUuid).add(t.toEventUuid);
    for (const w of workTrackers) {
      if (w.pickup.eventUuid) ids.add(w.pickup.eventUuid);
      if (w.dropoff.eventUuid) ids.add(w.dropoff.eventUuid);
    }
    return [...ids].sort();
  }, [needed.trips, workTrackers]);
  const namesCompiled = useMemo(() => eventNamesQuery(eventIds), [eventIds]);
  const names = useTypedQuery(namesCompiled, expect<{ id: string; event_name: string | null }>());

  const moves = useMemo(() => {
    const addresses = new Map<string, StoredAddress>(
      (addressRows.data ?? []).map(({ id, ...a }) => [id, a]),
    );
    return buildBleacherMoves(needed.trips, workTrackers, addresses);
  }, [needed.trips, workTrackers, addressRows.data]);

  const eventNames = useMemo(
    () => new Map((names.data ?? []).map((r) => [r.id, r.event_name || "Unnamed event"])),
    [names.data],
  );

  return {
    moves: zoneId ? moves : [],
    eventNames,
    isLoading:
      !!zoneId &&
      (needed.isLoading || trackers.isLoading || addressRows.isLoading || names.isLoading),
  };
}
