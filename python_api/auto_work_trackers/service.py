"""The feature itself: find the trips a zone needs for a week and create a draft work tracker for each.

Steps: 1) fetch the zone's bleachers, 2) keep the ones that need a trip, 3) create the work trackers.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from python_api.auto_work_trackers.dates import is_monday, week_end_of
from python_api.auto_work_trackers.assignment import AssignmentResult
from python_api.auto_work_trackers.discovery import discover_trips
from python_api.auto_work_trackers.models import BleacherInput, Driver, NeededTrip
from python_api.auto_work_trackers.routing import SEARCH_SECONDS, RouteDriver, plan_routes


class Repository(Protocol):
    def load_bleachers(self, zone_id: str, tz: str) -> list[BleacherInput]: ...
    def create_draft_work_trackers(self, trips: list[NeededTrip], dates: list[str]) -> list[str]: ...
    def load_zone_drivers(self, zone_id: str) -> list[Driver]: ...
    def load_address_points(self, address_ids: list[str]) -> dict[str, tuple[float, float]]: ...
    def load_blocked_days(self, driver_ids: list[str], week_start: str, tz: str) -> set[tuple[str, str]]: ...
    def existing_work_tracker_keys(
        self, trips: list["AcceptedTrip"], tz: str
    ) -> set[tuple[str, str, str | None]]: ...
    def create_accepted_work_trackers(self, trips: list["AcceptedTrip"]) -> list[str]: ...
    def create_planned_work_trackers(self, rows: list[dict[str, Any]]) -> list[str]: ...


@dataclass(frozen=True)
class GenerateResult:
    bleachers_in_zone: int
    trips: list[NeededTrip]
    work_tracker_ids: list[str]


class InvalidWeekError(ValueError):
    pass


def work_tracker_date(trip: NeededTrip, week_start: str) -> str:
    """Monday of the week, unless the bleacher is not free yet: then the day it frees up.

    Dating it inside the trip's window keeps a second run from finding the trip still missing.
    """
    return min(max(week_start, trip.available_from), trip.must_arrive_by)


def generate_work_trackers(repo: Repository, zone_id: str, week_start: str, tz: str) -> GenerateResult:
    if not is_monday(week_start):
        raise InvalidWeekError(f"week_start must be a Monday (YYYY-MM-DD), got {week_start!r}.")

    bleachers = repo.load_bleachers(zone_id, tz)
    trips = discover_trips(bleachers, week_start)
    ids = repo.create_draft_work_trackers(trips, [work_tracker_date(t, week_start) for t in trips])
    return GenerateResult(len(bleachers), trips, ids)


@dataclass(frozen=True)
class SuggestResult:
    bleachers_in_zone: int
    trips: list[NeededTrip]
    dates: list[str]  # where each trip's draft would be dated, same order as `trips`


def suggest_trips(repo: Repository, zone_id: str, week_start: str, tz: str) -> SuggestResult:
    """The trips `generate_work_trackers` would create, without creating anything."""
    if not is_monday(week_start):
        raise InvalidWeekError(f"week_start must be a Monday (YYYY-MM-DD), got {week_start!r}.")

    bleachers = repo.load_bleachers(zone_id, tz)
    trips = discover_trips(bleachers, week_start)
    return SuggestResult(len(bleachers), trips, [work_tracker_date(t, week_start) for t in trips])


@dataclass(frozen=True)
class AcceptedTrip:
    bleacher_uuid: str
    date: str
    from_address_uuid: str | None
    to_address_uuid: str | None
    driver_uuid: str | None = None


@dataclass(frozen=True)
class CreatedTracker:
    work_tracker_id: str
    bleacher_uuid: str
    date: str


@dataclass(frozen=True)
class SkippedTrip:
    bleacher_uuid: str
    date: str
    reason: str  # "outside_week" | "already_exists"


@dataclass(frozen=True)
class AcceptResult:
    created: list[CreatedTracker]
    skipped: list[SkippedTrip]


def accept_trips(repo: Repository, week_start: str, trips: list[AcceptedTrip], tz: str) -> AcceptResult:
    """Create the draft work trackers a person accepted. Only days inside the selected week are allowed.

    A trip dated outside Monday..Sunday of `week_start` is skipped, and so is one that already has an
    active work tracker for the same bleacher, day and drop-off (accepting twice creates one).
    """
    if not is_monday(week_start):
        raise InvalidWeekError(f"week_start must be a Monday (YYYY-MM-DD), got {week_start!r}.")

    week_end = week_end_of(week_start)
    skipped: list[SkippedTrip] = []
    in_week: list[AcceptedTrip] = []
    for trip in trips:
        if week_start <= trip.date <= week_end:
            in_week.append(trip)
        else:
            skipped.append(SkippedTrip(trip.bleacher_uuid, trip.date, "outside_week"))

    existing = repo.existing_work_tracker_keys(in_week, tz) if in_week else set()
    to_create: list[AcceptedTrip] = []
    seen: set[tuple[str, str, str | None]] = set()
    for trip in in_week:
        key = (trip.bleacher_uuid, trip.date, trip.to_address_uuid)
        if key in existing or key in seen:
            skipped.append(SkippedTrip(trip.bleacher_uuid, trip.date, "already_exists"))
            continue
        seen.add(key)
        to_create.append(trip)

    ids = repo.create_accepted_work_trackers(to_create) if to_create else []
    created = [
        CreatedTracker(wt_id, t.bleacher_uuid, t.date) for t, wt_id in zip(to_create, ids, strict=True)
    ]
    return AcceptResult(created, skipped)


@dataclass(frozen=True)
class PlanResult:
    bleachers_in_zone: int
    drivers_in_zone: int
    plan: AssignmentResult


def plan_assignments(
    repo: Repository, zone_id: str, week_start: str, tz: str, search_seconds: float = SEARCH_SECONDS
) -> PlanResult:
    """Find the zone's trips for the week and plan them as driver routes (see routing.plan_routes):
    several trips a day, one bleacher at a time, at most 12 hours a day. Creates nothing.

    A trip that cannot be placed comes back with the reason.
    """
    if not is_monday(week_start):
        raise InvalidWeekError(f"week_start must be a Monday (YYYY-MM-DD), got {week_start!r}.")

    bleachers = repo.load_bleachers(zone_id, tz)
    trips = discover_trips(bleachers, week_start)
    drivers = repo.load_zone_drivers(zone_id)
    if not drivers or not trips:
        empty = plan_routes(trips, [], set(), week_start, lambda _: None, tz, 0)
        return PlanResult(len(bleachers), len(drivers), empty)

    blocked = repo.load_blocked_days([d.driver_uuid for d in drivers], week_start, tz)
    wanted = [d.home_address_uuid for d in drivers if d.home_address_uuid] + [
        a for t in trips for a in (t.from_address_uuid, t.to_address_uuid) if a
    ]
    points = repo.load_address_points(wanted)
    route_drivers = [RouteDriver(d.driver_uuid, points.get(d.home_address_uuid or "")) for d in drivers]
    plan = plan_routes(
        trips, route_drivers, blocked, week_start, lambda a: points.get(a or ""), tz, search_seconds
    )
    return PlanResult(len(bleachers), len(drivers), plan)


@dataclass(frozen=True)
class GenerateAssignedResult:
    bleachers_in_zone: int
    plan: AssignmentResult
    work_tracker_ids: list[str]  # one per assigned trip, same order as `plan.assigned`


def planned_work_tracker_rows(plan: AssignmentResult, new_id: Callable[[], str]) -> list[dict[str, Any]]:
    """One draft work tracker row per assigned trip, in plan order (a trip's previous comes first).

    Ids are made here so each trip can point at the one it drives on from. Distances and minutes are
    the planner's estimates. Every row has every key, as one bulk insert needs.
    """
    ids = [new_id() for _ in plan.assigned]
    rows = []
    for i, a in enumerate(plan.assigned):
        rows.append(
            {
                "id": ids[i],
                "bleacher_uuid": a.trip.bleacher_uuid,
                "date": a.date,
                "status": "draft",
                "driver_uuid": a.driver_uuid,
                "pickup_address_uuid": a.trip.from_address_uuid,
                "dropoff_address_uuid": a.trip.to_address_uuid,
                "previous_work_tracker_uuid": ids[a.previous_index] if a.previous_index is not None else None,
                "planned_pickup_at": a.planned_pickup_at,
                "planned_dropoff_at": a.planned_dropoff_at,
                "distance_meters": a.haul.meters if a.haul else None,
                "drive_minutes": a.haul.minutes if a.haul else None,
                "deadhead_in_distance_meters": a.deadhead_in.meters if a.deadhead_in else None,
                "deadhead_in_drive_minutes": a.deadhead_in.minutes if a.deadhead_in else None,
                "return_home_distance_meters": a.return_home.meters if a.return_home else None,
                "return_home_drive_minutes": a.return_home.minutes if a.return_home else None,
            }
        )
    return rows


def generate_assigned_work_trackers(
    repo: Repository,
    zone_id: str,
    week_start: str,
    tz: str,
    search_seconds: float = SEARCH_SECONDS,
    new_id: Callable[[], str] = lambda: str(uuid4()),
) -> GenerateAssignedResult:
    """Plan the week as driver routes and create a draft work tracker for each trip that got a place.

    Each is created with its driver and day, the trip it follows that day (none: from home), the
    suggested pickup and drop-off times and the estimated legs. The rest are returned unassigned;
    nothing is created for them.
    """
    planned = plan_assignments(repo, zone_id, week_start, tz, search_seconds)
    rows = planned_work_tracker_rows(planned.plan, new_id)
    ids = repo.create_planned_work_trackers(rows) if rows else []
    return GenerateAssignedResult(planned.bleachers_in_zone, planned.plan, ids)
