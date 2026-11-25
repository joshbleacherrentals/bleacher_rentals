import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "../../../../../database.types";
import { requireAuth } from "@/features/userAccess/logic/requireAuth";
import {
  FIELD_MASK,
  MATRIX_URL,
  matrixBlocks,
  matrixBody,
  pairKey,
  parseMatrix,
  roundPoint,
  type Pair,
  type RoadLeg,
} from "@/features/autoWorkTrackers/planner/roadTimes";

export const maxDuration = 60;

const CACHE_DAYS = 30;
const CACHE_CHUNK = 100; // pair keys per cache read; keeps the URL short
const PARALLEL_REQUESTS = 8;
const MAX_PAIRS = 6000; // a planning run needs ~1,000; refuse anything far bigger

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Asks Google for every pair, in blocks, a few at a time. A failed block is simply missing. */
async function fetchFromGoogle(pairs: Pair[], key: string): Promise<Map<string, RoadLeg>> {
  const blocks = matrixBlocks(pairs);
  const found = new Map<string, RoadLeg>();
  for (let i = 0; i < blocks.length; i += PARALLEL_REQUESTS) {
    const answers = await Promise.all(
      blocks.slice(i, i + PARALLEL_REQUESTS).map(async ([origins, destinations]) => {
        try {
          const res = await fetch(MATRIX_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": key,
              "X-Goog-FieldMask": FIELD_MASK,
            },
            body: JSON.stringify(matrixBody(origins, destinations)),
          });
          if (!res.ok) return new Map<string, RoadLeg>();
          return parseMatrix(await res.json(), origins, destinations);
        } catch {
          return new Map<string, RoadLeg>();
        }
      }),
    );
    for (const legs of answers) for (const [k, leg] of legs) found.set(k, leg);
  }
  return found;
}

/**
 * Road distances and drive times for the Auto Work Trackers planner: POST { pairs: [[fromLat,
 * fromLng, toLat, toLng], ...] } → { legs: { [pairKey]: RoadLeg }, google, cached }.
 *
 * Each pair is answered from RouteCache (answers from the last 30 days), else asked of Google
 * (Compute Route Matrix: driving, no live traffic, avoiding tolls) and saved to the cache. A pair
 * with no answer (Google failed) is left out; the planner estimates it. Server-only: the Google key
 * and the cache never reach the browser.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { pairs?: unknown } | null;
  const raw = Array.isArray(body?.pairs) ? body.pairs : null;
  if (!raw || raw.length > MAX_PAIRS) {
    return NextResponse.json({ error: `pairs: an array of at most ${MAX_PAIRS}` }, { status: 400 });
  }
  const unique = new Map<string, Pair>();
  for (const p of raw) {
    if (
      !Array.isArray(p) ||
      p.length !== 4 ||
      !p.every((n) => typeof n === "number" && isFinite(n))
    )
      return NextResponse.json(
        { error: "each pair is [fromLat, fromLng, toLat, toLng]" },
        { status: 400 },
      );
    const pair: Pair = [roundPoint([p[0], p[1]]), roundPoint([p[2], p[3]])];
    unique.set(pairKey(...pair), pair);
  }

  const supabase = supabaseAdmin();
  const legs: Record<string, RoadLeg> = {};
  const keys = [...unique.keys()];
  const since = new Date(Date.now() - CACHE_DAYS * 24 * 3600 * 1000).toISOString();
  for (let i = 0; i < keys.length; i += CACHE_CHUNK) {
    const { data } = await supabase
      .from("RouteCache")
      .select("pair_key, found, distance_meters, duration_seconds")
      .in("pair_key", keys.slice(i, i + CACHE_CHUNK))
      .gte("fetched_at", since);
    for (const row of data ?? []) {
      legs[row.pair_key] = {
        found: row.found,
        meters: row.distance_meters,
        seconds: row.duration_seconds,
      };
    }
  }
  const cached = Object.keys(legs).length;

  const missing = keys.filter((k) => !(k in legs)).map((k) => unique.get(k)!);
  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  let google = 0;
  if (missing.length > 0 && key) {
    const fresh = await fetchFromGoogle(missing, key);
    const now = new Date().toISOString();
    const rows = [...fresh.entries()]
      .filter(([k]) => unique.has(k))
      .map(([k, leg]) => {
        const [[fromLat, fromLng], [toLat, toLng]] = unique.get(k)!;
        legs[k] = leg;
        return {
          pair_key: k,
          from_lat: fromLat,
          from_lng: fromLng,
          to_lat: toLat,
          to_lng: toLng,
          found: leg.found,
          distance_meters: leg.meters,
          duration_seconds: leg.seconds,
          fetched_at: now,
        };
      });
    google = rows.length;
    for (let i = 0; i < rows.length; i += 500) {
      // A failed cache write only costs a fresh lookup next time.
      await supabase.from("RouteCache").upsert(rows.slice(i, i + 500), { onConflict: "pair_key" });
    }
  }

  return NextResponse.json({ legs, google, cached });
}
