/**
 * The Python solver's contract (POST /api/py/auto-work-trackers/solve). Mirrors
 * python_api/auto_work_trackers/schemas.py; keep the two in step. The solver is pure: everything it
 * needs is in the request, and it never reads the database or the network.
 */

export type SolveVehicle = { id: string; home: number };
export type SolveTrip = { id: string; pickup: number; dropoff: number; vehicles: string[] };

export type SolveRequest = {
  /** Drive minutes from place i to place j. */
  minutes: number[][];
  /** What to minimise from place i to place j (metres). */
  costs: number[][];
  vehicles: SolveVehicle[];
  trips: SolveTrip[];
  max_day_minutes: number;
  search_seconds: number;
};

export type SolveStop = { trip: string; pickup_minute: number; dropoff_minute: number };
export type SolveRoute = { vehicle: string; stops: SolveStop[] };
export type SolveUnplacedReason = "no_vehicle" | "too_long_for_a_day" | "no_room";
export type SolveResponse = {
  routes: SolveRoute[];
  unplaced: { trip: string; reason: SolveUnplacedReason }[];
};

export async function callSolve(request: SolveRequest): Promise<SolveResponse> {
  const res = await fetch("/api/py/auto-work-trackers/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const hint =
      res.status === 404 && process.env.NODE_ENV === "development"
        ? " Is the Python dev server running? Start it with `npm run dev:py`."
        : "";
    throw new Error(`The route solver failed (status ${res.status}).${hint}`);
  }
  return res.json();
}
