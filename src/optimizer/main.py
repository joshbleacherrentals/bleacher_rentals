"""
Driver Assignment Optimizer
FastAPI microservice that solves the driver-to-trip assignment problem.
Uses scipy's linear_sum_assignment (Hungarian algorithm) to minimize total round-trip distance.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import math
from scipy.optimize import linear_sum_assignment
import numpy as np
from typing import Optional
import httpx
import os

app = FastAPI(title="Driver Assignment Optimizer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class LatLng(BaseModel):
    lat: float
    lng: float

class AddressPoint(BaseModel):
    uuid: str
    lat: float
    lng: float

class TripInput(BaseModel):
    work_tracker_id: str
    account_manager_uuid: str
    date: str                          # YYYY-MM-DD
    pickup_address: AddressPoint
    dropoff_address: AddressPoint
    distance_meters: Optional[float]   # pickup→dropoff already stored; None = we compute it
    current_driver_uuid: Optional[str] = None

class DriverInput(BaseModel):
    driver_uuid: str
    user_uuid: str
    account_manager_uuid: str
    first_name: Optional[str]
    last_name: Optional[str]
    home_address: AddressPoint         # resolved from Drivers.address_uuid
    days_off: list[str] = []           # list of YYYY-MM-DD strings

class AssignmentRequest(BaseModel):
    trips: list[TripInput]
    drivers: list[DriverInput]

class SwapWarning(BaseModel):
    conflicting_trip_id: str
    conflicting_trip_date: str
    suggested_swap_driver_uuid: Optional[str]
    suggested_swap_driver_name: Optional[str]
    message: str

class TripAssignment(BaseModel):
    work_tracker_id: str
    suggested_driver_uuid: str
    suggested_driver_name: str
    total_cost_meters: float          # home→pickup + pickup→dropoff
    leg_home_to_pickup_meters: float
    leg_pickup_to_dropoff_meters: float
    swap_warning: Optional[SwapWarning] = None

class AssignmentResponse(BaseModel):
    assignments: list[TripAssignment]
    total_distance_meters: float
    unassigned_trip_ids: list[str]

# ---------------------------------------------------------------------------
# Distance helpers
# ---------------------------------------------------------------------------

def haversine_meters(a: AddressPoint, b: AddressPoint) -> float:
    """Straight-line distance in meters (fast fallback)."""
    R = 6_371_000
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng)
    x = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


async def road_distance_meters(origin: AddressPoint, dest: AddressPoint) -> float:
    """
    Uses Google Maps Distance Matrix API when a key is available;
    falls back to haversine otherwise.
    """
    if not GOOGLE_MAPS_API_KEY:
        return haversine_meters(origin, dest)

    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "origins": f"{origin.lat},{origin.lng}",
        "destinations": f"{dest.lat},{dest.lng}",
        "units": "metric",
        "key": GOOGLE_MAPS_API_KEY,
    }
    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(url, params=params)
        if r.status_code == 200:
            data = r.json()
            try:
                meters = data["rows"][0]["elements"][0]["distance"]["value"]
                return float(meters)
            except (KeyError, IndexError):
                pass
    return haversine_meters(origin, dest)

# ---------------------------------------------------------------------------
# Core assignment logic
# ---------------------------------------------------------------------------

async def build_cost_matrix(
    trips: list[TripInput],
    drivers: list[DriverInput],
) -> tuple[np.ndarray, dict[str, set[str]]]:
    """
    Returns (cost_matrix, unavailability_map).
    cost_matrix[i][j] = home→pickup + pickup→dropoff meters for driver j on trip i
                        (INF if driver unavailable / wrong account manager)
    unavailability_map[driver_uuid] = set of trip_ids already assigned to that driver
    """
    INF = 1e12
    n_trips = len(trips)
    n_drivers = len(drivers)
    # Make square for the Hungarian algorithm (pad with zeros)
    dim = max(n_trips, n_drivers)
    cost = np.full((dim, dim), INF)

    # Pre-build driver day-off sets
    days_off_map: dict[str, set[str]] = {d.driver_uuid: set(d.days_off) for d in drivers}

    # Track drivers already assigned on each date
    # (trips that already have a current_driver_uuid assigned)
    existing_assignments: dict[str, set[str]] = {}  # driver_uuid -> set of work_tracker_ids
    for trip in trips:
        if trip.current_driver_uuid:
            existing_assignments.setdefault(trip.current_driver_uuid, set()).add(
                trip.work_tracker_id
            )

    for i, trip in enumerate(trips):
        for j, driver in enumerate(drivers):
            # Wrong account manager
            if driver.account_manager_uuid != trip.account_manager_uuid:
                continue
            # Driver has the day off
            if trip.date in days_off_map.get(driver.driver_uuid, set()):
                continue

            leg1 = await road_distance_meters(driver.home_address, trip.pickup_address)
            leg2 = trip.distance_meters if trip.distance_meters else await road_distance_meters(
                trip.pickup_address, trip.dropoff_address
            )
            cost[i][j] = leg1 + leg2

    return cost, existing_assignments


async def solve_assignments(request: AssignmentRequest) -> AssignmentResponse:
    trips = request.trips
    drivers = request.drivers

    if not trips:
        return AssignmentResponse(assignments=[], total_distance_meters=0, unassigned_trip_ids=[])

    cost_matrix, existing_assignments = await build_cost_matrix(trips, drivers)

    # Hungarian algorithm
    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    INF = 1e12
    assignments: list[TripAssignment] = []
    unassigned: list[str] = []

    # Build a quick name lookup
    driver_name: dict[str, str] = {
        d.driver_uuid: f"{d.first_name or ''} {d.last_name or ''}".strip()
        for d in drivers
    }

    for i, j in zip(row_ind, col_ind):
        if i >= len(trips):
            continue  # padding row
        trip = trips[i]
        if j >= len(drivers) or cost_matrix[i][j] >= INF:
            unassigned.append(trip.work_tracker_id)
            continue

        driver = drivers[j]
        total_cost = float(cost_matrix[i][j])
        leg1 = await road_distance_meters(driver.home_address, trip.pickup_address)
        leg2 = trip.distance_meters if trip.distance_meters else 0.0

        # Check for swap warning
        swap_warning: Optional[SwapWarning] = None
        already_on = existing_assignments.get(driver.driver_uuid, set())
        if already_on:
            conflicting_id = next(iter(already_on))
            conflicting_trip = next((t for t in trips if t.work_tracker_id == conflicting_id), None)

            # Find the next-best driver for this trip
            col_costs = [(cost_matrix[i][k], k) for k in range(len(drivers)) if k != j]
            col_costs.sort()
            alt_driver: Optional[DriverInput] = None
            for alt_cost, alt_k in col_costs:
                if alt_cost < INF:
                    alt_driver = drivers[alt_k]
                    break

            swap_warning = SwapWarning(
                conflicting_trip_id=conflicting_id,
                conflicting_trip_date=conflicting_trip.date if conflicting_trip else "",
                suggested_swap_driver_uuid=alt_driver.driver_uuid if alt_driver else None,
                suggested_swap_driver_name=driver_name.get(alt_driver.driver_uuid, "")
                if alt_driver
                else None,
                message=(
                    f"{driver_name.get(driver.driver_uuid, 'This driver')} is already assigned "
                    f"to trip {conflicting_id}. "
                    + (
                        f"Consider swapping to {driver_name.get(alt_driver.driver_uuid, 'another driver')} "
                        f"(+{round((alt_cost - total_cost) / 1000, 1)} km extra)."
                        if alt_driver
                        else "No alternative driver found."
                    )
                ),
            )

        assignments.append(
            TripAssignment(
                work_tracker_id=trip.work_tracker_id,
                suggested_driver_uuid=driver.driver_uuid,
                suggested_driver_name=driver_name.get(driver.driver_uuid, ""),
                total_cost_meters=total_cost,
                leg_home_to_pickup_meters=leg1,
                leg_pickup_to_dropoff_meters=leg2,
                swap_warning=swap_warning,
            )
        )

    total = sum(a.total_cost_meters for a in assignments)
    return AssignmentResponse(
        assignments=assignments,
        total_distance_meters=total,
        unassigned_trip_ids=unassigned,
    )

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/assign", response_model=AssignmentResponse)
async def assign_drivers(request: AssignmentRequest):
    try:
        return await solve_assignments(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}