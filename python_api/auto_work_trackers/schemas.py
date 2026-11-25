"""The /solve contract. The TypeScript side (src/features/autoWorkTrackers/planner/solveContract.ts)
mirrors these shapes; keep the two in step.

Everything the solver needs comes in the request: no database, no network. Places are indices into
the two square matrices.
"""

from pydantic import BaseModel, Field


class SolveVehicle(BaseModel):
    """One driver-day: a route that starts and ends at `home` (a place index)."""

    id: str
    home: int


class SolveTrip(BaseModel):
    """One bleacher move: pick up at `pickup`, drop off at `dropoff` (place indices), on one of
    `vehicles` (vehicle ids allowed to take it)."""

    id: str
    pickup: int
    dropoff: int
    vehicles: list[str]


class SolveRequest(BaseModel):
    minutes: list[list[int]] = Field(description="Drive minutes from place i to place j.")
    costs: list[list[int]] = Field(description="What to minimise from place i to place j (metres).")
    vehicles: list[SolveVehicle]
    trips: list[SolveTrip]
    max_day_minutes: int = 12 * 60
    search_seconds: float = 3.0


class SolveStop(BaseModel):
    trip: str
    pickup_minute: int  # minutes after the vehicle leaves home
    dropoff_minute: int


class SolveRoute(BaseModel):
    vehicle: str
    stops: list[SolveStop]  # in driving order


class SolveUnplaced(BaseModel):
    trip: str
    reason: str  # "no_vehicle" | "too_long_for_a_day" | "no_room"


class SolveResponse(BaseModel):
    routes: list[SolveRoute]
    unplaced: list[SolveUnplaced]
