"""What a plan is: the days a trip may happen, and each trip's driver, day and place in that day.

The plan itself is made by `routing.plan_routes`. This module holds the shared rules and shapes.

Pure: no database, no clock.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from python_api.auto_work_trackers.dates import week_end_of
from python_api.auto_work_trackers.models import NeededTrip
from python_api.auto_work_trackers.travel import Leg

NO_WINDOW = "no_window"  # the bleacher is never free between the events (they are back to back)
OUTSIDE_WEEK = "outside_week"  # its free days all fall outside the selected week
NO_FREE_DRIVER_DAY = "no_free_driver_day"  # no driver had room for it on a day it could happen
TOO_LONG_FOR_A_DAY = "too_long_for_a_day"  # even alone, home -> pickup -> drop-off -> home is over the day limit


@dataclass(frozen=True)
class Assignment:
    """One trip placed on a driver's day."""

    trip: NeededTrip
    driver_uuid: str
    date: str
    sequence: int = 1  # 1 for the day's first trip, 2 for the next, ...
    # Index (into AssignmentResult.assigned) of the trip this one drives on from; None: from home.
    previous_index: int | None = None
    planned_pickup_at: str | None = None  # ISO timestamps with the zone's offset
    planned_dropoff_at: str | None = None
    deadhead_in: Leg | None = None  # home, or the previous drop-off, to this pickup
    haul: Leg | None = None  # pickup to drop-off
    return_home: Leg | None = None  # drop-off to home; only on the day's last trip

    @property
    def distance_m(self) -> int | None:
        """Estimated metres driven empty to the pickup (None when unknown)."""
        return self.deadhead_in.meters if self.deadhead_in else None


@dataclass(frozen=True)
class Unassigned:
    trip: NeededTrip
    reason: str


@dataclass(frozen=True)
class AssignmentResult:
    assigned: list[Assignment] = field(default_factory=list)
    unassigned: list[Unassigned] = field(default_factory=list)


def _days(first: str, last: str) -> list[str]:
    start, end = date.fromisoformat(first), date.fromisoformat(last)
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def allowed_days(trip: NeededTrip, week_start: str) -> tuple[list[str], str | None]:
    """The days the trip may happen, or (empty, why not)."""
    first = trip.earliest_day if trip.earliest_day is not None else trip.available_from
    last = trip.latest_day if trip.latest_day is not None else trip.must_arrive_by
    if first > last:
        return [], NO_WINDOW
    first, last = max(first, week_start), min(last, week_end_of(week_start))
    if first > last:
        return [], OUTSIDE_WEEK
    return _days(first, last), None
