"""The /solve contract. The TypeScript side (src/features/autoWorkTrackers/planner/solveContract.ts)
mirrors these shapes; keep the two in step.

Everything the solver needs comes in the request: no database, no network. Places are indices into
the two square matrices.
"""

from pydantic import BaseModel, Field


class SolveVehicle(BaseModel):
    """One driver-day: a route that starts and ends at `home` (a place index). `trip_cost` is added
    to the cost for each trip it takes (in the units of `costs`), so it is used only when worth it."""

    id: str
    home: int
    trip_cost: int = Field(default=0, ge=0)


class SolveTrip(BaseModel):
    """One bleacher move: pick up at `pickup`, drop off at `dropoff` (place indices), on one of
    `vehicles` (vehicle ids allowed to take it). `pickup_minutes` / `dropoff_minutes` are the time
    spent on site at each end before driving on (e.g. a teardown, a setup); they count towards the
    day."""

    id: str
    pickup: int
    dropoff: int
    vehicles: list[str]
    pickup_minutes: int = Field(default=0, ge=0)
    dropoff_minutes: int = Field(default=0, ge=0)


class SolveRequest(BaseModel):
    minutes: list[list[int]] = Field(description="Drive minutes from place i to place j.")
    costs: list[list[int]] = Field(description="What to minimise from place i to place j (e.g. metres or seconds).")
    vehicles: list[SolveVehicle]
    trips: list[SolveTrip]
    max_day_minutes: int = 12 * 60
    search_seconds: float = 3.0


class SolveStop(BaseModel):
    trip: str
    pickup_minute: int  # arrival at the pickup, in minutes after the vehicle leaves home
    dropoff_minute: int  # arrival at the drop-off


class SolveRoute(BaseModel):
    vehicle: str
    stops: list[SolveStop]  # in driving order


class SolveUnplaced(BaseModel):
    trip: str
    reason: str  # "no_vehicle" | "too_long_for_a_day" | "no_room"


class SolveResponse(BaseModel):
    routes: list[SolveRoute]
    unplaced: list[SolveUnplaced]
