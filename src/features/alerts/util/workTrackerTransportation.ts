import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import { resolveAddress, resolveAddressFull, ResolvedAddress } from "@/utils/resolveAddress";
import { localDayEndInstant, localDayStartInstant } from "./localDayInstant";

type BeRow = {
  eventStart: string | null;
  address: string | null;
  eventStatus: string | null;
};

type FullBeRow = {
  eventStart: string | null;
  address: string | null;
  eventStatus: string | null;
  addressUuid: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

type WtAddrRow = {
  date: string | null;
  dropoffAddress: string | null;
};

type FullWtRow = {
  date: string | null;
  dropoffAddress: string | null;
  dropoffAddressUuid: string | null;
  dropoffCity: string | null;
  dropoffState: string | null;
  dropoffPostalCode: string | null;
  pickupAddress: string | null;
  pickupAddressUuid: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupPostalCode: string | null;
};

export const normalizeStreet = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function isPickupTransportationMismatch(
  expectedPickupStreet: string | null | undefined,
  pickupStreet: string | null | undefined,
): boolean {
  if (!expectedPickupStreet || !pickupStreet) return false;
  return normalizeStreet(expectedPickupStreet) !== normalizeStreet(pickupStreet);
}

/**
 * Both helpers below fetch at most ONE candidate row per source instead of the
 * bleacher's whole history. `resolveAddress` is a max/min selection, so over two
 * candidates it returns exactly what it returned over two thousand — provided
 * the candidates are chosen with the same predicates. Every filter the JS
 * applies is therefore mirrored in SQL: with `LIMIT 1`, a row that SQL returns
 * and JS then discards yields a null instead of letting the next-nearest row
 * win, which would silently stop the alert firing.
 *
 * Work tracker dates are compared against the raw `targetDate` string, exactly
 * as the JS does. Event starts are timestamps, so they are compared against a
 * local-day boundary instant — see `localDayInstant`.
 */
export async function getExpectedPickupStreetForWorkTracker(params: {
  bleacherUuid: string;
  targetDate: string;
  excludeWorkTrackerUuid?: string | null;
}): Promise<string | null> {
  const { bleacherUuid, targetDate, excludeWorkTrackerUuid } = params;

  const beRows = await typedGetAll(
    db
      .selectFrom("BleacherEvents as be")
      .innerJoin("Events as e", "e.id", "be.event_uuid")
      .innerJoin("Addresses as a", "a.id", "e.address_uuid")
      .select([
        "e.event_start as eventStart",
        "a.street as address",
        "e.event_status as eventStatus",
      ])
      .where("be.bleacher_uuid", "=", bleacherUuid)
      .where("e.deleted", "=", 0)
      .where("e.event_status", "=", "booked")
      .where("a.street", "is not", null)
      .where("a.street", "!=", "")
      .where("e.event_start", "<=", localDayEndInstant(targetDate))
      .orderBy("e.event_start", "desc")
      .limit(1)
      .compile(),
    expect<BeRow>(),
  );

  let wtQuery = db
    .selectFrom("WorkTrackers as wt")
    .innerJoin("Addresses as a", "a.id", "wt.dropoff_address_uuid")
    .select(["wt.date as date", "a.street as dropoffAddress"])
    .where("wt.bleacher_uuid", "=", bleacherUuid)
    .where("a.street", "is not", null)
    .where("a.street", "!=", "")
    .where("wt.date", "<=", targetDate);

  if (excludeWorkTrackerUuid) {
    wtQuery = wtQuery.where("wt.id", "!=", excludeWorkTrackerUuid);
  }

  const wtRows = await typedGetAll(
    wtQuery.orderBy("wt.date", "desc").limit(1).compile(),
    expect<WtAddrRow>(),
  );

  return resolveAddress(
    {
      bleacherEvents: beRows
        .filter((r) => r.eventStart != null)
        .map((r) => ({
          booked: r.eventStatus === "booked",
          eventStart: r.eventStart!,
          address: r.address ?? "",
        })),
      workTrackers: wtRows,
    },
    targetDate,
  );
}

/**
 * Same logic as getExpectedPickupStreetForWorkTracker but returns the full
 * address record (UUID, city, state, postal). Used by the locate button so
 * both the warning and the button resolve from identical filtered data.
 *
 * direction:
 *   'past'   — last known location before targetDate (pickup locate)
 *   'future' — next known location after targetDate (dropoff locate)
 *
 * Note the asymmetry with `resolveAddress`: `resolveAddressFull`'s future
 * direction INCLUDES the target date, where `resolveAddress`'s excludes it. The
 * bounds below mirror this function, not the other one.
 */
export async function getExpectedAddressFullForWorkTracker(params: {
  bleacherUuid: string;
  targetDate: string;
  excludeWorkTrackerUuid?: string | null;
  direction?: "past" | "future";
}): Promise<ResolvedAddress | null> {
  const { bleacherUuid, targetDate, excludeWorkTrackerUuid, direction = "past" } = params;
  const lookingBack = direction === "past";

  let beQuery = db
    .selectFrom("BleacherEvents as be")
    .innerJoin("Events as e", "e.id", "be.event_uuid")
    .innerJoin("Addresses as a", "a.id", "e.address_uuid")
    .select([
      "e.event_start as eventStart",
      "a.street as address",
      "e.event_status as eventStatus",
      "e.address_uuid as addressUuid",
      "a.city as city",
      "a.state_province as state",
      "a.zip_postal as postalCode",
    ])
    .where("be.bleacher_uuid", "=", bleacherUuid)
    .where("e.deleted", "=", 0)
    .where("e.event_status", "=", "booked")
    .where("a.street", "is not", null)
    .where("a.street", "!=", "");

  beQuery = lookingBack
    ? beQuery.where("e.event_start", "<=", localDayEndInstant(targetDate))
    : beQuery.where("e.event_start", ">=", localDayStartInstant(targetDate));

  const beRows = await typedGetAll(
    beQuery
      .orderBy("e.event_start", lookingBack ? "desc" : "asc")
      .limit(1)
      .compile(),
    expect<FullBeRow>(),
  );

  // The direction decides which address has to be present: looking back the
  // bleacher was dropped off somewhere, looking forward it is picked up.
  let wtQuery = db
    .selectFrom("WorkTrackers as wt")
    .leftJoin("Addresses as ad", "ad.id", "wt.dropoff_address_uuid")
    .leftJoin("Addresses as ap", "ap.id", "wt.pickup_address_uuid")
    .select([
      "wt.date as date",
      "ad.street as dropoffAddress",
      "wt.dropoff_address_uuid as dropoffAddressUuid",
      "ad.city as dropoffCity",
      "ad.state_province as dropoffState",
      "ad.zip_postal as dropoffPostalCode",
      "ap.street as pickupAddress",
      "wt.pickup_address_uuid as pickupAddressUuid",
      "ap.city as pickupCity",
      "ap.state_province as pickupState",
      "ap.zip_postal as pickupPostalCode",
    ])
    .where("wt.bleacher_uuid", "=", bleacherUuid)
    .where("wt.date", lookingBack ? "<=" : ">=", targetDate);

  // Looking back the bleacher was dropped off somewhere; looking forward it is
  // picked up. Written as two branches rather than one interpolated column name
  // so the column references stay typed.
  wtQuery = lookingBack
    ? wtQuery
        .where("wt.dropoff_address_uuid", "is not", null)
        .where("ad.street", "is not", null)
        .where("ad.street", "!=", "")
    : wtQuery
        .where("wt.pickup_address_uuid", "is not", null)
        .where("ap.street", "is not", null)
        .where("ap.street", "!=", "");

  if (excludeWorkTrackerUuid) {
    wtQuery = wtQuery.where("wt.id", "!=", excludeWorkTrackerUuid);
  }

  const wtRows = await typedGetAll(
    wtQuery
      .orderBy("wt.date", lookingBack ? "desc" : "asc")
      .limit(1)
      .compile(),
    expect<FullWtRow>(),
  );

  return resolveAddressFull(
    {
      bleacherEvents: beRows
        .filter((r) => r.eventStart != null)
        .map((r) => ({
          booked: r.eventStatus === "booked",
          eventStart: r.eventStart!,
          address: r.address ?? "",
          addressUuid: r.addressUuid,
          city: r.city,
          state: r.state,
          postalCode: r.postalCode,
        })),
      workTrackers: wtRows,
    },
    targetDate,
    direction,
  );
}
