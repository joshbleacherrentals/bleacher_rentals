import type { SuggestedTrip } from "../utils/suggestions";

const devHint = (status: number) =>
  status === 404 && process.env.NODE_ENV === "development"
    ? " Is the Python dev server running? Start it with `npm run dev:py`."
    : "";

type SuggestedTripJson = {
  bleacher_uuid: string;
  bleacher_number: number | null;
  from_address_uuid: string | null;
  to_address_uuid: string | null;
  from_street: string;
  to_street: string;
  from_event_uuid: string;
  to_event_uuid: string;
  date: string;
  available_from: string;
  must_arrive_by: string;
};

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The trips the Python service would create for the zone and week. Nothing is created. */
export async function suggestTrips(params: {
  zoneId: string;
  weekStart: string;
}): Promise<SuggestedTrip[]> {
  const res = await fetch("/api/py/auto-work-trackers/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      zone_id: params.zoneId,
      week_start: params.weekStart,
      timezone: timezone(),
    }),
  });
  if (!res.ok)
    throw new Error(`Could not suggest trips (status ${res.status}).${devHint(res.status)}`);
  const body: { trips: SuggestedTripJson[] } = await res.json();
  return body.trips.map((t) => ({
    bleacherUuid: t.bleacher_uuid,
    bleacherNumber: t.bleacher_number,
    fromAddressUuid: t.from_address_uuid,
    toAddressUuid: t.to_address_uuid,
    fromStreet: t.from_street,
    toStreet: t.to_street,
    fromEventUuid: t.from_event_uuid,
    toEventUuid: t.to_event_uuid,
    date: t.date,
    availableFrom: t.available_from,
    mustArriveBy: t.must_arrive_by,
  }));
}

export type AcceptTripsResult = {
  created: { work_tracker_id: string; bleacher_uuid: string; date: string }[];
  skipped: { bleacher_uuid: string; date: string; reason: string }[];
};

/** Creates draft work trackers for accepted trips. The service only creates days inside `weekStart`'s week. */
export async function acceptTrips(params: {
  weekStart: string;
  trips: SuggestedTrip[];
}): Promise<AcceptTripsResult> {
  const res = await fetch("/api/py/auto-work-trackers/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      week_start: params.weekStart,
      timezone: timezone(),
      trips: params.trips.map((t) => ({
        bleacher_uuid: t.bleacherUuid,
        date: t.date,
        from_address_uuid: t.fromAddressUuid,
        to_address_uuid: t.toAddressUuid,
      })),
    }),
  });
  if (!res.ok)
    throw new Error(
      `Could not create the work tracker (status ${res.status}).${devHint(res.status)}`,
    );
  return res.json();
}
