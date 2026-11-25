import type { LinxupPosition, LinxupStop } from "../server/linxup";

// docs/specs/analytics-mcp.md §12: join Linxup GPS data to bleachers by IMEI
// (Bleachers.linxup_device_id). Pure, so the rules are tested without Linxup.

export type BleacherTrackerRow = { bleacher_number: number; linxup_device_id: string | null };

export type CurrentBleacherLocation = {
  bleacher_number: number;
  tracker: string | null;
  /** Other bleachers on the same tracker: the position may belong to any of them. */
  shares_tracker_with: number[];
  latitude: number | null;
  longitude: number | null;
  reported_at: string | null;
  minutes_since_report: number | null;
  speed: number | null;
  note: string | null;
};

export type BleacherStop = {
  begin: string;
  end: string | null;
  minutes: number | null;
  latitude: number;
  longitude: number;
  address: string | null;
  geofence: string | null;
};

export const MAX_HISTORY_DAYS = 7;
export const MAX_HISTORY_BLEACHERS = 20;

const iso = (ms: number) => new Date(ms).toISOString();

function sharing(rows: BleacherTrackerRow[]): Map<string, number[]> {
  const byTracker = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.linxup_device_id) continue;
    const list = byTracker.get(r.linxup_device_id) ?? [];
    list.push(r.bleacher_number);
    byTracker.set(r.linxup_device_id, list);
  }
  return byTracker;
}

/** The bleachers asked for (all when none are named), in number order, and the numbers not found. */
export function pickBleachers(
  rows: BleacherTrackerRow[],
  numbers: number[] | undefined,
): { picked: BleacherTrackerRow[]; unknown: number[] } {
  const sorted = [...rows].sort((a, b) => a.bleacher_number - b.bleacher_number);
  if (!numbers || numbers.length === 0) return { picked: sorted, unknown: [] };
  const wanted = new Set(numbers);
  const picked = sorted.filter((r) => wanted.has(r.bleacher_number));
  const found = new Set(picked.map((r) => r.bleacher_number));
  return { picked, unknown: [...wanted].filter((n) => !found.has(n)).sort((a, b) => a - b) };
}

/** Each bleacher's last GPS report. `all` is every bleacher, to find shared trackers. */
export function currentBleacherLocations(
  picked: BleacherTrackerRow[],
  all: BleacherTrackerRow[],
  positions: LinxupPosition[],
  nowMs: number,
): CurrentBleacherLocation[] {
  const byImei = new Map(positions.map((p) => [p.imei, p]));
  const shared = sharing(all);
  return picked.map((b) => {
    const tracker = b.linxup_device_id;
    const others = tracker
      ? (shared.get(tracker) ?? []).filter((n) => n !== b.bleacher_number)
      : [];
    const p = tracker ? byImei.get(tracker) : undefined;
    const base = {
      bleacher_number: b.bleacher_number,
      tracker,
      shares_tracker_with: others,
    };
    if (!p) {
      return {
        ...base,
        latitude: null,
        longitude: null,
        reported_at: null,
        minutes_since_report: null,
        speed: null,
        note: tracker
          ? "Linxup has no position for this tracker."
          : "No GPS tracker is set on this bleacher.",
      };
    }
    return {
      ...base,
      latitude: p.latitude,
      longitude: p.longitude,
      reported_at: iso(p.date),
      minutes_since_report: Math.max(0, Math.round((nowMs - p.date) / 60_000)),
      speed: p.speed,
      note: others.length > 0 ? "This tracker is set on more than one bleacher." : null,
    };
  });
}

/** Parse the history window; an error message when it is not usable. */
export function parseWindow(
  from: string,
  to: string,
  nowMs: number,
): { ok: true; fromMs: number; toMs: number } | { ok: false; error: string } {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return {
      ok: false,
      error: "from and to must be ISO 8601 date-times, e.g. 2026-07-04T00:00:00-04:00.",
    };
  }
  if (toMs <= fromMs) return { ok: false, error: "to must be after from." };
  if (toMs - fromMs > MAX_HISTORY_DAYS * 86_400_000) {
    return { ok: false, error: `The window can be at most ${MAX_HISTORY_DAYS} days.` };
  }
  if (fromMs > nowMs) return { ok: false, error: "from is in the future." };
  return { ok: true, fromMs, toMs: Math.min(toMs, nowMs) };
}

/** Split a window into consecutive pieces no longer than maxMs (one Linxup call each). */
export function splitWindow(fromMs: number, toMs: number, maxMs: number): [number, number][] {
  const out: [number, number][] = [];
  for (let start = fromMs; start < toMs; start += maxMs) {
    out.push([start, Math.min(start + maxMs, toMs)]);
  }
  return out;
}

/**
 * The stops of each bleacher's tracker that overlap [fromMs, toMs], oldest first, without the
 * duplicates that consecutive windows return.
 */
export function bleacherStops(
  picked: BleacherTrackerRow[],
  stops: LinxupStop[],
  fromMs: number,
  toMs: number,
): Map<number, BleacherStop[]> {
  const byImei = new Map<string, LinxupStop[]>();
  const seen = new Set<string>();
  for (const s of stops) {
    const key = `${s.imei}|${s.beginDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (s.beginDate > toMs || (s.endDate != null && s.endDate < fromMs)) continue;
    const list = byImei.get(s.imei) ?? [];
    list.push(s);
    byImei.set(s.imei, list);
  }

  const out = new Map<number, BleacherStop[]>();
  for (const b of picked) {
    const list = b.linxup_device_id ? (byImei.get(b.linxup_device_id) ?? []) : [];
    out.set(
      b.bleacher_number,
      list
        .sort((x, y) => x.beginDate - y.beginDate)
        .map((s) => ({
          begin: iso(s.beginDate),
          end: s.endDate == null ? null : iso(s.endDate),
          minutes: s.endDate == null ? null : Math.round((s.endDate - s.beginDate) / 60_000),
          latitude: s.latitude,
          longitude: s.longitude,
          address: [s.street, s.city, s.stateCode].filter(Boolean).join(", ") || null,
          geofence: s.geofenceName,
        })),
    );
  }
  return out;
}
