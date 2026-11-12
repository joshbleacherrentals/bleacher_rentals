"""The feature itself: find the trips a zone needs for a week and create a draft work tracker for each.

Steps: 1) fetch the zone's bleachers, 2) keep the ones that need a trip, 3) create the work trackers.
"""

from dataclasses import dataclass
from typing import Protocol

from python_api.auto_work_trackers.dates import is_monday
from python_api.auto_work_trackers.discovery import discover_trips
from python_api.auto_work_trackers.models import BleacherInput, NeededTrip


class Repository(Protocol):
    def load_bleachers(self, zone_id: str, tz: str) -> list[BleacherInput]: ...
    def create_draft_work_trackers(self, trips: list[NeededTrip], dates: list[str]) -> list[str]: ...


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
