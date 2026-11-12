import pytest

from python_api.auto_work_trackers.models import BleacherInput, NeededTrip, Stop
from python_api.auto_work_trackers.service import InvalidWeekError, generate_work_trackers, work_tracker_date


class FakeRepo:
    def __init__(self, bleachers):
        self.bleachers = bleachers
        self.created = None

    def load_bleachers(self, zone_id, tz):
        self.loaded = (zone_id, tz)
        return self.bleachers

    def create_draft_work_trackers(self, trips, dates):
        self.created = (trips, dates)
        return [f"wt{i}" for i in range(len(trips))]


def two_events(number, start_b="2026-11-12"):
    return BleacherInput(
        f"b{number}",
        number,
        [Stop("a", "a", "addr-a", "1 Main", "2026-11-01", "2026-11-08"), Stop("b", "b", "addr-b", "2 Oak", start_b, "2026-11-14")],
    )


def test_only_bleachers_that_need_a_trip_get_a_work_tracker():
    still = BleacherInput("b9", 9, [])
    repo = FakeRepo([two_events(1), still, two_events(2)])
    result = generate_work_trackers(repo, "zone-1", "2026-11-09", "America/Edmonton")
    assert repo.loaded == ("zone-1", "America/Edmonton")
    assert result.bleachers_in_zone == 3
    assert [t.bleacher_number for t in repo.created[0]] == [1, 2]
    assert result.work_tracker_ids == ["wt0", "wt1"]


def test_the_date_is_monday_unless_the_bleacher_is_not_free_yet():
    trip = lambda frm, to: NeededTrip("b", 1, "x", "s", "y", "t", "e1", "e2", frm, to)
    assert work_tracker_date(trip("2026-11-01", "2026-11-12"), "2026-11-09") == "2026-11-09"
    assert work_tracker_date(trip("2026-11-11", "2026-11-12"), "2026-11-09") == "2026-11-11"
    assert work_tracker_date(trip("2026-11-01", "2026-11-09"), "2026-11-09") == "2026-11-09"


def test_nothing_is_created_when_no_trips_are_needed():
    repo = FakeRepo([BleacherInput("b1", 1, [])])
    assert generate_work_trackers(repo, "z", "2026-11-09", "UTC").work_tracker_ids == []


def test_a_week_that_does_not_start_on_monday_is_refused_before_touching_data():
    repo = FakeRepo([])
    with pytest.raises(InvalidWeekError):
        generate_work_trackers(repo, "z", "2026-11-10", "UTC")
    assert not hasattr(repo, "loaded")
