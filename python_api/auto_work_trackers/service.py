"""The feature itself: find the trips a zone needs for a week and create a draft work tracker for each.

Steps: 1) fetch the zone's bleachers, 2) keep the ones that need a trip, 3) create the work trackers.
"""

from dataclasses import dataclass
from typing import Protocol

from python_api.auto_work_trackers.dates import is_monday, week_end_of
from python_api.auto_work_trackers.assignment import AssignmentResult, assign_trips
from python_api.auto_work_trackers.discovery import discover_trips
from python_api.auto_work_trackers.geo import distance_m
from python_api.auto_work_trackers.models import BleacherInput, Driver, NeededTrip


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


def plan_assignments(repo: Repository, zone_id: str, week_start: str, tz: str) -> PlanResult:
    """Find the zone's trips for the week and choose a driver and day for each. Creates nothing.

    One trip per driver per day. A trip that cannot be placed comes back with the reason.
    """
    if not is_monday(week_start):
        raise InvalidWeekError(f"week_start must be a Monday (YYYY-MM-DD), got {week_start!r}.")

    bleachers = repo.load_bleachers(zone_id, tz)
    trips = discover_trips(bleachers, week_start)
    drivers = repo.load_zone_drivers(zone_id)
    driver_ids = [d.driver_uuid for d in drivers]
    if not drivers or not trips:
        return PlanResult(len(bleachers), len(drivers), assign_trips(trips, driver_ids, set(), week_start))

    blocked = repo.load_blocked_days(driver_ids, week_start, tz)
    wanted = [d.home_address_uuid for d in drivers if d.home_address_uuid] + [
        t.from_address_uuid for t in trips if t.from_address_uuid
    ]
    points = repo.load_address_points(wanted)
    home_of = {d.driver_uuid: d.home_address_uuid for d in drivers}

    def distance(driver_uuid: str, trip: NeededTrip) -> int | None:
        home = points.get(home_of.get(driver_uuid) or "")
        pickup = points.get(trip.from_address_uuid or "")
        return distance_m(home, pickup) if home and pickup else None

    return PlanResult(len(bleachers), len(drivers), assign_trips(trips, driver_ids, blocked, week_start, distance))


@dataclass(frozen=True)
class GenerateAssignedResult:
    bleachers_in_zone: int
    plan: AssignmentResult
    work_tracker_ids: list[str]  # one per assigned trip, same order as `plan.assigned`


def generate_assigned_work_trackers(
    repo: Repository, zone_id: str, week_start: str, tz: str
) -> GenerateAssignedResult:
    """Plan the week (a driver and day per trip, one trip per driver per day) and create the work trackers.

    Only trips that got a driver and day are created, as drafts with the driver set. The rest are
    returned unassigned; nothing is created for them.
    """
    planned = plan_assignments(repo, zone_id, week_start, tz)
    accepted = [
        AcceptedTrip(a.trip.bleacher_uuid, a.date, a.trip.from_address_uuid, a.trip.to_address_uuid, a.driver_uuid)
        for a in planned.plan.assigned
    ]
    ids = repo.create_accepted_work_trackers(accepted) if accepted else []
    return GenerateAssignedResult(planned.bleachers_in_zone, planned.plan, ids)
