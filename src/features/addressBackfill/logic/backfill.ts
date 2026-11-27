/**
 * The pure rules of the Address Backfill (Dev Tools → Address Backfill): which addresses without a
 * map position can take one from an identical address, what is written and logged for each
 * (AddressBackfillChanges), and which logged changes a revert may undo. No database, no Google.
 */

export type BackfillAddress = {
  id: string;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  country: string | null;
};

/** The four columns the backfill writes, as logged before and after a change. */
export type GeoValues = {
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  country: string | null;
};

/** Street, city and province, ignoring case, spacing and a trailing dot: two rows that are the same place. */
export function addressKey(a: Pick<BackfillAddress, "street" | "city" | "state_province">): string {
  const norm = (s: string | null) =>
    (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "").trim();
  return [norm(a.street), norm(a.city), norm(a.state_province)].join("|");
}

/** What a row holds of the four columns now. */
export function geoOf(row: GeoValues): GeoValues {
  return {
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    place_id: row.place_id ?? null,
    country: row.country ?? null,
  };
}

/**
 * What a row should hold after the backfill: the position and place id found, and the country only
 * when the row had none (a country someone set is never changed).
 */
export function geoAfter(
  row: GeoValues,
  found: { latitude: number; longitude: number; place_id: string | null; country: string | null },
): GeoValues {
  return {
    latitude: found.latitude,
    longitude: found.longitude,
    place_id: found.place_id,
    country: row.country || found.country || null,
  };
}

/**
 * For each address missing a map position, the values of an identical address that has one (the
 * work tracker window used to copy an address' text only). An address with no street is never
 * matched: a bare city is not one place.
 */
export function twinValues(
  missing: BackfillAddress[],
  candidates: BackfillAddress[],
): Map<string, GeoValues> {
  const byKey = new Map<string, BackfillAddress>();
  for (const c of candidates) {
    if (c.latitude == null || c.longitude == null || !c.street?.trim()) continue;
    const key = addressKey(c);
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const out = new Map<string, GeoValues>();
  for (const m of missing) {
    if (!m.street?.trim()) continue;
    const twin = byKey.get(addressKey(m));
    if (!twin || twin.id === m.id) continue;
    out.set(
      m.id,
      geoAfter(m, {
        latitude: twin.latitude!,
        longitude: twin.longitude!,
        place_id: twin.place_id,
        country: twin.country,
      }),
    );
  }
  return out;
}

/** An address the backfill looked at, for the preview and the list of ones to fix by hand. */
export type ReviewRow = {
  id: string;
  /** The text sent to Google (or the row's text when nothing was looked up). */
  text: string;
  /** Google's answer, when it gave one. */
  google: string | null;
  /** twin: copy from an identical address; google: Google was confident; none: left for a person. */
  outcome: "twin" | "google" | "none";
  /** Why it was left, for "none". */
  reason: string | null;
};

export type BackfillTotals = {
  scanned: number;
  copied: number;
  geocoded: number;
  /** Google answered, but not confidently enough to trust (a town centre, another state…). */
  uncertain: number;
  notFound: number;
  noStreet: number;
  /** Rows left for a person, and why (on a preview: every row looked at). */
  review: ReviewRow[];
};

/** The most rows the page keeps for the list of ones to fix by hand. */
export const REVIEW_LIMIT = 500;

export const EMPTY_TOTALS: BackfillTotals = {
  scanned: 0,
  copied: 0,
  geocoded: 0,
  uncertain: 0,
  notFound: 0,
  noStreet: 0,
  review: [],
};

/** Running totals across batches. Pure. */
export function addTotals(total: BackfillTotals, batch: BackfillTotals): BackfillTotals {
  return {
    scanned: total.scanned + batch.scanned,
    copied: total.copied + batch.copied,
    geocoded: total.geocoded + batch.geocoded,
    uncertain: total.uncertain + batch.uncertain,
    notFound: total.notFound + batch.notFound,
    noStreet: total.noStreet + batch.noStreet,
    review: [...total.review, ...batch.review].slice(0, REVIEW_LIMIT),
  };
}

/** A logged change, as read back (before and after parsed). */
export type LoggedChange = {
  id: string;
  address_uuid: string;
  before: GeoValues;
  after: GeoValues;
  reverted_at: string | null;
};

const sameNumber = (a: number | null, b: number | null) =>
  a == null || b == null ? a === b : Math.abs(a - b) < 1e-9;

/** Whether a row still holds exactly what a change wrote. Pure. */
export function stillAsWritten(current: GeoValues, after: GeoValues): boolean {
  return (
    sameNumber(current.latitude, after.latitude) &&
    sameNumber(current.longitude, after.longitude) &&
    (current.place_id ?? null) === (after.place_id ?? null) &&
    (current.country ?? null) === (after.country ?? null)
  );
}

export type RevertPlan = {
  /** Addresses to put back, with the values they held before. */
  restore: { addressId: string; values: GeoValues; changeId: string }[];
  /** Changes whose address was edited since: left alone, and not stamped reverted. */
  changedSince: number;
  /** Changes already reverted, or whose address no longer exists. */
  skipped: number;
};

/**
 * What reverting these changes does: an address goes back to its `before` only while it still holds
 * exactly what the change wrote. One someone has edited since is left alone, so a revert never
 * undoes a person's fix. Pure.
 */
export function planRevert(changes: LoggedChange[], current: Map<string, GeoValues>): RevertPlan {
  const plan: RevertPlan = { restore: [], changedSince: 0, skipped: 0 };
  for (const c of changes) {
    const now = current.get(c.address_uuid);
    if (c.reverted_at || !now) {
      plan.skipped++;
      continue;
    }
    if (!stillAsWritten(now, c.after)) {
      plan.changedSince++;
      continue;
    }
    plan.restore.push({ addressId: c.address_uuid, values: c.before, changeId: c.id });
  }
  return plan;
}

/** A logged change's JSON column, read back; null fields when it cannot be parsed. Pure. */
export function parseGeo(text: string | null): GeoValues {
  try {
    const v = JSON.parse(text ?? "") as Partial<GeoValues>;
    return {
      latitude: typeof v.latitude === "number" ? v.latitude : null,
      longitude: typeof v.longitude === "number" ? v.longitude : null,
      place_id: typeof v.place_id === "string" ? v.place_id : null,
      country: typeof v.country === "string" ? v.country : null,
    };
  } catch {
    return { latitude: null, longitude: null, place_id: null, country: null };
  }
}
