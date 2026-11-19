import json

import httpx
import pytest

from python_api.auto_work_trackers.models import BleacherInput, Stop
from python_api.auto_work_trackers.repository import WorkTrackerRepository
from python_api.auto_work_trackers.service import AcceptedTrip, InvalidWeekError, accept_trips, suggest_trips
from python_api.core.supabase import SupabaseRest


class FakeRepo:
    def __init__(self, bleachers=(), existing=()):
        self.bleachers = list(bleachers)
        self.existing = set(existing)
        self.created = None
        self.created_called = False

    def load_bleachers(self, zone_id, tz):
        return self.bleachers

    def create_draft_work_trackers(self, trips, dates):  # pragma: no cover - suggest must not call it
        raise AssertionError("suggest must not write")

    def existing_work_tracker_keys(self, trips, tz):
        return self.existing

    def create_accepted_work_trackers(self, trips):
        self.created_called = True
        self.created = trips
        return [f"wt{i}" for i in range(len(trips))]


def trip(bleacher="b1", day="2026-11-10", to="a2"):
    return AcceptedTrip(bleacher, day, "a1", to)


def test_suggest_returns_the_trips_and_dates_without_writing_anything():
    b = BleacherInput(
        "b1",
        1,
        [Stop("a", "a", "a1", "1 Main", "2026-11-01", "2026-11-08"), Stop("b", "b", "a2", "2 Oak", "2026-11-12", "2026-11-14")],
    )
    result = suggest_trips(FakeRepo([b]), "z", "2026-11-09", "UTC")
    assert [t.to_street for t in result.trips] == ["2 Oak"]
    assert result.dates == ["2026-11-09"]


def test_suggest_refuses_a_week_that_does_not_start_on_monday():
    with pytest.raises(InvalidWeekError):
        suggest_trips(FakeRepo(), "z", "2026-11-10", "UTC")


def test_accept_creates_trips_inside_the_week():
    repo = FakeRepo()
    result = accept_trips(repo, "2026-11-09", [trip(day="2026-11-09"), trip("b2", day="2026-11-15")], "UTC")
    assert [c.work_tracker_id for c in result.created] == ["wt0", "wt1"]
    assert [c.bleacher_uuid for c in result.created] == ["b1", "b2"]
    assert result.skipped == []


def test_accept_skips_days_outside_the_selected_week_and_never_creates_them():
    repo = FakeRepo()
    result = accept_trips(repo, "2026-11-09", [trip(day="2026-11-08"), trip(day="2026-11-16")], "UTC")
    assert result.created == []
    assert [(s.date, s.reason) for s in result.skipped] == [
        ("2026-11-08", "outside_week"),
        ("2026-11-16", "outside_week"),
    ]
    assert repo.created_called is False


def test_accept_skips_a_trip_that_already_has_a_work_tracker():
    repo = FakeRepo(existing={("b1", "2026-11-10", "a2")})
    result = accept_trips(repo, "2026-11-09", [trip(), trip("b2")], "UTC")
    assert [c.bleacher_uuid for c in result.created] == ["b2"]
    assert [(s.bleacher_uuid, s.reason) for s in result.skipped] == [("b1", "already_exists")]


def test_accepting_the_same_trip_twice_in_one_request_creates_one():
    result = accept_trips(FakeRepo(), "2026-11-09", [trip(), trip()], "UTC")
    assert len(result.created) == 1
    assert [s.reason for s in result.skipped] == ["already_exists"]


def test_accept_refuses_a_week_that_does_not_start_on_monday():
    with pytest.raises(InvalidWeekError):
        accept_trips(FakeRepo(), "2026-11-10", [trip()], "UTC")


def repo_with(requests, work_trackers):
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(201, json=[{"id": f"wt{i}"} for i, _ in enumerate(json.loads(request.content))])
        return httpx.Response(200, json=work_trackers)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    return WorkTrackerRepository(SupabaseRest("https://x.supabase.co", "key", client))


def test_repository_existing_keys_ignore_work_trackers_that_are_off():
    rows = [
        {"bleacher_uuid": "b1", "date": "2026-11-10", "status": "draft", "dropoff_address_uuid": "a2"},
        {"bleacher_uuid": "b1", "date": "2026-11-10", "status": "cancelled", "dropoff_address_uuid": "a3"},
    ]
    keys = repo_with([], rows).existing_work_tracker_keys([trip()], "UTC")
    assert keys == {("b1", "2026-11-10", "a2")}


def test_repository_creates_drafts_with_only_bleacher_date_and_addresses():
    requests = []
    ids = repo_with(requests, []).create_accepted_work_trackers([trip()])
    assert ids == ["wt0"]
    assert json.loads(requests[0].content) == [
        {"bleacher_uuid": "b1", "date": "2026-11-10", "status": "draft",
         "pickup_address_uuid": "a1", "dropoff_address_uuid": "a2"}
    ]
