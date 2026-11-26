import { SCHEMA_MAX_ROWS } from "../constants";
import {
  bleacherStops,
  currentBleacherLocations,
  MAX_HISTORY_BLEACHERS,
  parseWindow,
  pickBleachers,
  splitWindow,
  type BleacherTrackerRow,
} from "../logic/bleacherLocations";
import { LINXUP_STOPS_MAX_MS, type LinxupClient } from "./linxup";
import { runReadOnlyQuery, type PoolLike } from "./runReadOnlyQuery";

// docs/specs/analytics-mcp.md §12: the two bleacher location tools. Bleachers come from the
// read-only role, positions from Linxup; the join is in logic/bleacherLocations.ts.

const BLEACHERS_SQL = `select bleacher_number, linxup_device_id
from "Bleachers"
where deleted = false and bleacher_number is not null`;

export type ToolOutcome = { ok: true; body: unknown; count: number } | { ok: false; error: string };

async function readBleachers(pool: PoolLike): Promise<BleacherTrackerRow[]> {
  const res = await runReadOnlyQuery(pool, BLEACHERS_SQL, { maxRows: SCHEMA_MAX_ROWS });
  return res.rows.map((r) => ({
    bleacher_number: Number(r.bleacher_number),
    linxup_device_id: r.linxup_device_id == null ? null : String(r.linxup_device_id),
  }));
}

export async function currentLocationsTool(
  pool: PoolLike,
  linxup: LinxupClient,
  input: { bleacher_numbers?: number[] },
  nowMs = Date.now(),
): Promise<ToolOutcome> {
  const [all, positions] = await Promise.all([readBleachers(pool), linxup.currentPositions()]);
  const { picked, unknown } = pickBleachers(all, input.bleacher_numbers);
  const bleachers = currentBleacherLocations(picked, all, positions, nowMs);
  return {
    ok: true,
    count: bleachers.length,
    body: {
      as_of: new Date(nowMs).toISOString(),
      ...(unknown.length > 0 ? { unknown_bleacher_numbers: unknown } : {}),
      bleachers,
    },
  };
}

export async function locationHistoryTool(
  pool: PoolLike,
  linxup: LinxupClient,
  input: { bleacher_numbers: number[]; from: string; to: string },
  nowMs = Date.now(),
): Promise<ToolOutcome> {
  if (
    input.bleacher_numbers.length === 0 ||
    input.bleacher_numbers.length > MAX_HISTORY_BLEACHERS
  ) {
    return { ok: false, error: `Name between 1 and ${MAX_HISTORY_BLEACHERS} bleacher numbers.` };
  }
  const window = parseWindow(input.from, input.to, nowMs);
  if (!window.ok) return { ok: false, error: window.error };

  const all = await readBleachers(pool);
  const { picked, unknown } = pickBleachers(all, input.bleacher_numbers);
  // One Linxup call per 48 hours; each returns every tracker's stops.
  const pieces = splitWindow(window.fromMs, window.toMs, LINXUP_STOPS_MAX_MS);
  const [stopsPerPiece, positions] = await Promise.all([
    Promise.all(pieces.map(([from, to]) => linxup.stops(from, to))),
    linxup.currentPositions(),
  ]);
  const stops = bleacherStops(picked, stopsPerPiece.flat(), window.fromMs, window.toMs);
  const current = currentBleacherLocations(picked, all, positions, nowMs);

  return {
    ok: true,
    count: picked.length,
    body: {
      from: new Date(window.fromMs).toISOString(),
      to: new Date(window.toMs).toISOString(),
      how_to_read:
        "stops are where the tracker sat still (engine/ignition off), oldest first; the bleacher was " +
        "moving between them. A stop still going on is not listed: if there are no stops, or none after " +
        "a given time, the bleacher has probably not moved since, so its current position applies. " +
        "Times are UTC.",
      ...(unknown.length > 0 ? { unknown_bleacher_numbers: unknown } : {}),
      bleachers: current.map((c) => ({
        bleacher_number: c.bleacher_number,
        tracker: c.tracker,
        shares_tracker_with: c.shares_tracker_with,
        stops: stops.get(c.bleacher_number) ?? [],
        current: {
          latitude: c.latitude,
          longitude: c.longitude,
          reported_at: c.reported_at,
          note: c.note,
        },
      })),
    },
  };
}
