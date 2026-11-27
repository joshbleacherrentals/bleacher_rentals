import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { GeoValues } from "../logic/backfill";

/**
 * The local-database reads and writes of the Address Backfill. Writes go through PowerSync like
 * every other screen: an address and its AddressBackfillChanges row in the same batch, so an
 * address is never changed without a record of it.
 */

const ADDRESS_COLUMNS = [
  "id",
  "street",
  "city",
  "state_province",
  "zip_postal",
  "latitude",
  "longitude",
  "place_id",
  "country",
] as const;

/** Every address with no map position, by id. */
export function missingAddressesQuery() {
  return db
    .selectFrom("Addresses")
    .select(ADDRESS_COLUMNS)
    .where("latitude", "is", null)
    .orderBy("id")
    .compile();
}

/** Addresses that have a map position and one of these street texts: the identical-address source. */
export function twinCandidatesQuery(streets: string[]) {
  return db
    .selectFrom("Addresses")
    .select(ADDRESS_COLUMNS)
    .where("latitude", "is not", null)
    .where("street", "in", streets.length ? streets : ["__none__"])
    .compile();
}

/**
 * One address change and its log row: the address only takes the new values while it still has no
 * position, and the log keeps what it held before and what was written.
 */
export function changeStatements(c: {
  changeId: string;
  runUuid: string;
  userUuid: string | null;
  addressId: string;
  source: "twin" | "google";
  googleAnswer: string | null;
  before: GeoValues;
  after: GeoValues;
  now: string;
}): CompiledQuery[] {
  return [
    db
      .updateTable("Addresses")
      .set({
        latitude: c.after.latitude,
        longitude: c.after.longitude,
        place_id: c.after.place_id,
        country: c.after.country,
      })
      .where("id", "=", c.addressId)
      .where("latitude", "is", null)
      .compile(),
    db
      .insertInto("AddressBackfillChanges")
      .values({
        id: c.changeId,
        created_at: c.now,
        created_by_user_uuid: c.userUuid,
        run_uuid: c.runUuid,
        address_uuid: c.addressId,
        source: c.source,
        google_answer: c.googleAnswer,
        before: JSON.stringify(c.before),
        after: JSON.stringify(c.after),
      })
      .compile(),
  ];
}

/** Every logged change, newest first, with who made it: grouped into runs on the page. */
export function changesQuery() {
  return db
    .selectFrom("AddressBackfillChanges as c")
    .leftJoin("Users as u", "u.id", "c.created_by_user_uuid")
    .select([
      "c.id as id",
      "c.run_uuid as run_uuid",
      "c.created_at as created_at",
      "c.source as source",
      "c.reverted_at as reverted_at",
      "u.first_name as first_name",
      "u.last_name as last_name",
    ])
    .orderBy("c.created_at", "desc")
    .compile();
}

/** One run's changes, for reverting it. */
export function runChangesQuery(runUuid: string) {
  return db
    .selectFrom("AddressBackfillChanges")
    .select(["id", "address_uuid", "before", "after", "reverted_at"])
    .where("run_uuid", "=", runUuid)
    .compile();
}

/** The four backfilled columns of these addresses as they are now. */
export function currentGeoQuery(ids: string[]) {
  return db
    .selectFrom("Addresses")
    .select(["id", "latitude", "longitude", "place_id", "country"])
    .where("id", "in", ids.length ? ids : ["__none__"])
    .compile();
}

/** Puts an address back to what it held before a change, and stamps the change reverted. */
export function revertStatements(r: {
  addressId: string;
  values: GeoValues;
  changeId: string;
  userUuid: string | null;
  now: string;
}): CompiledQuery[] {
  return [
    db
      .updateTable("Addresses")
      .set({
        latitude: r.values.latitude,
        longitude: r.values.longitude,
        place_id: r.values.place_id,
        country: r.values.country,
      })
      .where("id", "=", r.addressId)
      .compile(),
    db
      .updateTable("AddressBackfillChanges")
      .set({ reverted_at: r.now, reverted_by_user_uuid: r.userUuid })
      .where("id", "=", r.changeId)
      .compile(),
  ];
}
