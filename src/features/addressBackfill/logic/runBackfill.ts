import { geocodeQuery, judgeGeocode, type GeocodeAnswer } from "@/lib/geocoding/geocode";
import {
  EMPTY_TOTALS,
  addTotals,
  addressKey,
  geoAfter,
  geoOf,
  twinValues,
  type BackfillAddress,
  type BackfillTotals,
  type GeoValues,
  type ReviewRow,
} from "./backfill";

/** Addresses handled, then written, together: one PowerSync batch each. */
export const CHUNK = 25;
export const PREVIEW_SIZE = 20;
/** Pause between Google lookups: the browser geocoder refuses bursts. */
const PACE_MS = 150;
const RATE_LIMIT_WAIT_MS = 2000;
const RATE_LIMIT_TRIES = 3;

/** One address to write, with its log. */
export type PlannedChange = {
  addressId: string;
  source: "twin" | "google";
  googleAnswer: string | null;
  before: GeoValues;
  after: GeoValues;
};

export type RunDeps = {
  /** Addresses with a position and one of these streets (identical-address candidates). */
  readTwins: (streets: string[]) => Promise<BackfillAddress[]>;
  /** Google's answer, or null; throws isRateLimited errors when asked to slow down. */
  lookup: (a: BackfillAddress) => Promise<GeocodeAnswer | null>;
  isRateLimited: (e: unknown) => boolean;
  /** Writes a chunk's changes in one batch (not called on a preview). */
  write: (changes: PlannedChange[]) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  onProgress?: (totals: BackfillTotals, done: number, of: number) => void;
  shouldStop?: () => boolean;
};

async function lookupWithRetry(a: BackfillAddress, deps: RunDeps) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.lookup(a);
    } catch (e) {
      if (!deps.isRateLimited(e) || attempt >= RATE_LIMIT_TRIES) throw e;
      await deps.sleep(RATE_LIMIT_WAIT_MS * attempt);
    }
  }
}

/**
 * One chunk: identical addresses first, then Google for the rest, judged by judgeGeocode. Returns
 * the changes to write and the chunk's totals; `preview` puts every row in the review list.
 * `found` remembers this run's confident answers by addressKey, so an identical address later in
 * the run copies the first one's instead of asking Google again.
 */
export async function planChunk(
  rows: BackfillAddress[],
  deps: RunDeps,
  preview: boolean,
  found: Map<string, GeoValues> = new Map(),
): Promise<{ changes: PlannedChange[]; totals: BackfillTotals }> {
  const streets = [...new Set(rows.flatMap((r) => (r.street?.trim() ? [r.street] : [])))];
  const twins = twinValues(rows, streets.length ? await deps.readTwins(streets) : []);
  const changes: PlannedChange[] = [];
  const review: ReviewRow[] = [];
  const totals = { ...EMPTY_TOTALS, scanned: rows.length };

  for (const r of rows) {
    const text = geocodeQuery(r);
    const key = r.street?.trim() ? addressKey(r) : null;
    const earlier = key ? found.get(key) : undefined;
    const twin =
      twins.get(r.id) ??
      (earlier
        ? geoAfter(r, {
            latitude: earlier.latitude!,
            longitude: earlier.longitude!,
            place_id: earlier.place_id,
            country: earlier.country,
          })
        : undefined);
    if (twin) {
      totals.copied++;
      changes.push({
        addressId: r.id,
        source: "twin",
        googleAnswer: null,
        before: geoOf(r),
        after: twin,
      });
      if (preview)
        review.push({
          id: r.id,
          text: r.street ?? "",
          google: null,
          outcome: "twin",
          reason: null,
        });
      continue;
    }
    if (!text) {
      totals.noStreet++;
      review.push({
        id: r.id,
        text: [r.street, r.city, r.state_province, r.zip_postal].filter(Boolean).join(", "),
        google: null,
        outcome: "none",
        reason: "no street or city to look up",
      });
      continue;
    }
    const g = await lookupWithRetry(r, deps);
    await deps.sleep(PACE_MS);
    if (!g) {
      totals.notFound++;
      review.push({
        id: r.id,
        text,
        google: null,
        outcome: "none",
        reason: "Google found nothing",
      });
      continue;
    }
    const verdict = judgeGeocode(r, g);
    if (!verdict.ok) {
      totals.uncertain++;
      review.push({
        id: r.id,
        text,
        google: g.formattedAddress,
        outcome: "none",
        reason: verdict.reason,
      });
      continue;
    }
    totals.geocoded++;
    if (key) found.set(key, geoAfter({ ...geoOf(r), country: null }, g));
    changes.push({
      addressId: r.id,
      source: "google",
      googleAnswer: g.formattedAddress,
      before: geoOf(r),
      after: geoAfter(r, g),
    });
    if (preview) {
      review.push({ id: r.id, text, google: g.formattedAddress, outcome: "google", reason: null });
    }
  }
  return { changes, totals: { ...totals, review } };
}

/**
 * The whole run over `rows` (every address without a position), CHUNK at a time: plan, then
 * write, then report progress; stops between chunks when asked. A preview looks at the first
 * PREVIEW_SIZE and writes nothing. Any error other than a rate limit (the key refused, the Maps
 * script missing) ends the run; what was written so far stays written, and logged.
 */
export async function runBackfill(
  rows: BackfillAddress[],
  deps: RunDeps,
  preview = false,
): Promise<BackfillTotals> {
  const work = preview ? rows.slice(0, PREVIEW_SIZE) : rows;
  let totals = EMPTY_TOTALS;
  const found = new Map<string, GeoValues>();
  for (let i = 0; i < work.length; i += CHUNK) {
    if (i > 0 && deps.shouldStop?.()) break;
    const { changes, totals: chunk } = await planChunk(
      work.slice(i, i + CHUNK),
      deps,
      preview,
      found,
    );
    if (!preview && changes.length > 0) await deps.write(changes);
    totals = addTotals(totals, chunk);
    deps.onProgress?.(totals, Math.min(i + CHUNK, work.length), work.length);
  }
  return totals;
}
