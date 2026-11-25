// The Linxup GPS API (v2, the one the app already uses for the bleacher location modal), for the
// analytics connector's bleacher location tools (docs/specs/analytics-mcp.md §12). Read-only.
//
// Checked against the live API on 2026-11-25:
//  - GET  /ibis/rest/api/v2/locations → { data: { locations: [{ imei, latitude, longitude, date (epoch ms), speed, status, … }] } }
//  - POST /ibis/rest/api/v2/stops { fromDate, toDate } (epoch ms, at most 48 hours apart) →
//    { data: { stops: [{ imei, latitude, longitude, beginDate, endDate, duration, street, city, stateCode, geofenceName, … }] } }
//    It ignores a device filter, returns every tracker's stops, and includes stops that began before
//    fromDate. An error comes back as { responseType: "Error", data: { message } } with HTTP 200.

export type LinxupPosition = {
  imei: string;
  latitude: number;
  longitude: number;
  /** epoch ms of the last report */
  date: number;
  speed: number | null;
  status: string | null;
};

export type LinxupStop = {
  imei: string;
  latitude: number;
  longitude: number;
  beginDate: number;
  endDate: number | null;
  street: string | null;
  city: string | null;
  stateCode: string | null;
  geofenceName: string | null;
};

export type LinxupClient = {
  currentPositions(): Promise<LinxupPosition[]>;
  stops(fromMs: number, toMs: number): Promise<LinxupStop[]>;
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** The longest window one /stops call accepts. */
export const LINXUP_STOPS_MAX_MS = 48 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000; // Vercel Hobby cuts a function at 10 s.

export class LinxupError extends Error {}

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** null when LINXUP_API_HOST or LINXUP_API_TOKEN is not set. */
export function createLinxupClient(
  host: string | undefined,
  token: string | undefined,
  fetchImpl: FetchLike = fetch,
): LinxupClient | null {
  if (!host || !token) return null;
  const base = `${host.replace(/\/+$/, "")}/ibis/rest/api/v2`;

  async function call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new LinxupError(`Linxup did not answer: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new LinxupError(`Linxup answered HTTP ${res.status}.`);
    const json = (await res.json().catch(() => null)) as {
      responseType?: string;
      data?: Record<string, unknown>;
    } | null;
    if (!json || typeof json !== "object") throw new LinxupError("Linxup returned invalid JSON.");
    if (json.responseType === "Error") {
      const message = str((json.data as { message?: unknown } | undefined)?.message);
      throw new LinxupError(`Linxup refused the request: ${message ?? "unknown error"}.`);
    }
    return json.data ?? {};
  }

  return {
    async currentPositions() {
      const data = await call("/locations", { method: "GET" });
      const rows = Array.isArray(data.locations) ? data.locations : [];
      return rows.flatMap((r: Record<string, unknown>): LinxupPosition[] => {
        const imei = str(r.imei);
        const latitude = num(r.latitude);
        const longitude = num(r.longitude);
        const date = num(r.date);
        if (!imei || latitude == null || longitude == null || date == null) return [];
        return [{ imei, latitude, longitude, date, speed: num(r.speed), status: str(r.status) }];
      });
    },

    async stops(fromMs, toMs) {
      const data = await call("/stops", {
        method: "POST",
        body: JSON.stringify({ fromDate: fromMs, toDate: toMs }),
      });
      const rows = Array.isArray(data.stops) ? data.stops : [];
      return rows.flatMap((r: Record<string, unknown>): LinxupStop[] => {
        const imei = str(r.imei);
        const latitude = num(r.latitude);
        const longitude = num(r.longitude);
        const beginDate = num(r.beginDate);
        if (!imei || latitude == null || longitude == null || beginDate == null) return [];
        return [
          {
            imei,
            latitude,
            longitude,
            beginDate,
            endDate: num(r.endDate),
            street: str(r.street),
            city: str(r.city),
            stateCode: str(r.stateCode),
            geofenceName: str(r.geofenceName),
          },
        ];
      });
    },
  };
}
