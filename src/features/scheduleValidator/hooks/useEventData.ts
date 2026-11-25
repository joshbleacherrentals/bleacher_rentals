"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { timestampToDate } from "@/features/autoWorkTrackers/utils/discoverTrips";
import { eventDataQuery } from "../db/eventQueries";
import { buildEventData, type EventData, type EventRole } from "../utils/eventData";

type Row = {
  event_uuid: string;
  event_name: string | null;
  setup_start: string | null;
  event_start: string | null;
  address_uuid: string | null;
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
 * The listed events (see eventDataRoles) and whether they have the data the work tracker model
 * needs, from the local database.
 */
export function useEventData(roles: Map<string, EventRole[]>): {
  events: EventData[];
  isLoading: boolean;
} {
  const ids = useMemo(() => [...roles.keys()].sort(), [roles]);
  const compiled = useMemo(() => eventDataQuery(ids), [ids]);
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const events = useMemo(
    () =>
      buildEventData(
        (data ?? []).map((r) => ({
          eventId: r.event_uuid,
          eventName: r.event_name || "Unnamed event",
          startDate: timestampToDate(r.setup_start) ?? timestampToDate(r.event_start),
          addressUuid: r.address_uuid,
          address: r.address_uuid
            ? {
                street: r.street,
                city: r.city,
                state_province: r.state_province,
                zip_postal: r.zip_postal,
                country: r.country,
                latitude: r.latitude,
                longitude: r.longitude,
                place_id: r.place_id,
              }
            : null,
          roles: roles.get(r.event_uuid) ?? [],
        })),
      ),
    [data, roles],
  );

  return { events, isLoading };
}
