import json

import httpx

from python_api.auto_work_trackers.models import BleacherInput, Driver, Stop
from python_api.auto_work_trackers.repository import WorkTrackerRepository
from python_api.auto_work_trackers.service import AcceptedTrip, generate_assigned_work_trackers, plan_assignments
from python_api.core.supabase import SupabaseRest

WEEK = "2026-11-09"


class FakeRepo:
    def __init__(self, bleachers, drivers, blocked=(), points=None, homes=None):
        self.bleachers, self.blocked = bleachers, set(blocked)
        self.points = points or {}
        self.drivers = [Driver(d, (homes or {}).get(d)) for d in drivers]
        self.blocked_asked_for = None
        self.created = None

    def create_accepted_work_trackers(self, trips):
        self.created = trips
        return [f"wt{i}" for i in range(len(trips))]

    def load_bleachers(self, zone_id, tz):
        return self.bleachers

    def load_zone_drivers(self, zone_id):
        return self.drivers

    def load_address_points(self, address_ids):
        return {a: p for a, p in self.points.items() if a in address_ids}

    def load_blocked_days(self, driver_ids, week_start, tz):
        self.blocked_asked_for = (driver_ids, week_start)
        return self.blocked


def moving(number):
    return BleacherInput(
        f"b{number}",
        number,
        [
            Stop("a", "a", "a1", "1 Main", "2026-11-01", "2026-11-08"),
            Stop("b", "b", "a2", "2 Oak", "2026-11-12", "2026-11-14"),
        ],
    )


def test_plan_gives_each_trip_a_driver_and_a_day_in_its_window():
    result = plan_assignments(FakeRepo([moving(1), moving(2)], ["d1", "d2"]), "z", WEEK, "UTC")
    assert result.drivers_in_zone == 2
    assert len(result.plan.assigned) == 2
    for a in result.plan.assigned:
        assert "2026-11-09" <= a.date <= "2026-11-11"


def test_plan_respects_days_drivers_cannot_work():
    blocked = {("d1", "2026-11-09"), ("d1", "2026-11-10")}
    result = plan_assignments(FakeRepo([moving(1)], ["d1"], blocked), "z", WEEK, "UTC")
    assert [(a.driver_uuid, a.date) for a in result.plan.assigned] == [("d1", "2026-11-11")]


def test_plan_reports_trips_when_the_zone_has_no_drivers():
    result = plan_assignments(FakeRepo([moving(1)], []), "z", WEEK, "UTC")
    assert [u.reason for u in result.plan.unassigned] == ["no_free_driver_day"]


def test_plan_does_not_look_up_blocked_days_when_there_is_nothing_to_place():
    repo = FakeRepo([BleacherInput("b9", 9, [])], ["d1"])
    plan_assignments(repo, "z", WEEK, "UTC")
    assert repo.blocked_asked_for is None


def repo_with(requests, tables):
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(201, json=[{"id": f"wt{i}"} for i, _ in enumerate(json.loads(request.content))])
        return httpx.Response(200, json=tables[request.url.path.rsplit("/", 1)[1]])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    return WorkTrackerRepository(SupabaseRest("https://x.supabase.co", "key", client))


def test_zone_drivers_are_the_active_ones_assigned_to_the_zone():
    tables = {
        "DriverZones": [{"driver_uuid": "d2"}, {"driver_uuid": "d1"}, {"driver_uuid": "d3"}],
        "Drivers": [
            {"id": "d1", "is_active": True, "address_uuid": "home1"},
            {"id": "d2", "is_active": True, "address_uuid": None},
            {"id": "d3", "is_active": False, "address_uuid": "home3"},
        ],
    }
    requests = []
    assert repo_with(requests, tables).load_zone_drivers("zone-1") == [Driver("d1", "home1"), Driver("d2", None)]
    assert requests[0].url.params["zone_uuid"] == "eq.zone-1"


def test_zone_drivers_leave_out_the_ones_excluded_from_the_model():
    tables = {
        "DriverZones": [{"driver_uuid": "d1"}, {"driver_uuid": "d2"}],
        "Drivers": [
            {"id": "d1", "is_active": True, "address_uuid": "home1", "exclude_from_auto_work_trackers": False},
            {"id": "d2", "is_active": True, "address_uuid": "home2", "exclude_from_auto_work_trackers": True},
        ],
    }
    requests = []
    assert repo_with(requests, tables).load_zone_drivers("zone-1") == [Driver("d1", "home1")]
    assert "exclude_from_auto_work_trackers" in requests[1].url.params["select"]


def test_blocked_days_are_unavailable_days_and_active_work_trackers_inside_the_week():
    tables = {
        "DriverUnavailability": [
            {"driver_uuid": "d1", "date_unavailable": "2026-11-10"},
            {"driver_uuid": "d1", "date_unavailable": "2026-11-16"},  # outside the week
        ],
        "WorkTrackers": [
            {"driver_uuid": "d2", "date": "2026-11-11", "status": "draft"},
            {"driver_uuid": "d2", "date": "2026-11-12", "status": "cancelled"},
        ],
    }
    blocked = repo_with([], tables).load_blocked_days(["d1", "d2"], WEEK, "UTC")
    assert blocked == {("d1", "2026-11-10"), ("d2", "2026-11-11")}


def test_an_accepted_trip_with_a_driver_is_created_with_that_driver():
    requests = []
    repo_with(requests, {}).create_accepted_work_trackers([AcceptedTrip("b1", "2026-11-10", "a1", "a2", "d1")])
    assert json.loads(requests[0].content)[0]["driver_uuid"] == "d1"


def test_an_accepted_trip_without_a_driver_has_no_driver_field():
    requests = []
    repo_with(requests, {}).create_accepted_work_trackers([AcceptedTrip("b1", "2026-11-10", "a1", "a2")])
    assert "driver_uuid" not in json.loads(requests[0].content)[0]


def test_generate_creates_only_the_trips_that_got_a_driver_and_day_with_the_driver_set():
    repo = FakeRepo([moving(1), moving(2), moving(3), moving(4)], ["d1"])
    # one driver, a three-day window: three trips fit, the fourth does not
    result = generate_assigned_work_trackers(repo, "z", WEEK, "UTC")
    assert len(repo.created) == 3 and len(result.work_tracker_ids) == 3
    assert {t.driver_uuid for t in repo.created} == {"d1"}
    assert len({t.date for t in repo.created}) == 3  # one trip per driver per day
    assert [u.reason for u in result.plan.unassigned] == ["no_free_driver_day"]


def test_generate_creates_nothing_when_no_trip_fits():
    repo = FakeRepo([moving(1)], [])
    assert generate_assigned_work_trackers(repo, "z", WEEK, "UTC").work_tracker_ids == []
    assert repo.created is None


POINTS = {"yard": (51.05, -114.07), "near": (51.06, -114.08), "far": (53.55, -113.49)}


def test_plan_picks_the_driver_whose_home_is_nearest_the_pickup():
    # moving() picks up at address a1; put the pickup in Calgary and one driver near it, one in Edmonton.
    repo = FakeRepo(
        [moving(1)],
        ["d1", "d2"],
        points={"a1": POINTS["yard"], "home-near": POINTS["near"], "home-far": POINTS["far"]},
        homes={"d1": "home-far", "d2": "home-near"},
    )
    (assigned,) = plan_assignments(repo, "z", WEEK, "UTC").plan.assigned
    assert assigned.driver_uuid == "d2"
    assert 0 < assigned.distance_m < 5_000


def test_plan_gives_each_trip_its_nearest_free_driver_when_they_compete():
    # Both trips pick up in Calgary. d1 is nearest, but can only do one trip a day, and both trips
    # are only possible on one day, so the other goes to the next nearest driver.
    def one_day(number):
        return BleacherInput(
            f"b{number}",
            number,
            [
                Stop("a", "a", "a1", "1 Main", "2026-11-01", "2026-11-09"),
                Stop("b", "b", "a2", "2 Oak", "2026-11-11", "2026-11-14"),
            ],
        )

    repo = FakeRepo(
        [one_day(1), one_day(2)],
        ["d1", "d2", "d3"],
        points={"a1": POINTS["yard"], "h1": POINTS["near"], "h2": (51.2, -114.2), "h3": POINTS["far"]},
        homes={"d1": "h1", "d2": "h2", "d3": "h3"},
    )
    assigned = plan_assignments(repo, "z", WEEK, "UTC").plan.assigned
    assert sorted(a.driver_uuid for a in assigned) == ["d1", "d2"]


def test_a_driver_with_no_home_on_file_is_chosen_last():
    repo = FakeRepo(
        [moving(1)],
        ["d1", "d2"],
        points={"a1": POINTS["yard"], "home-far": POINTS["far"]},
        homes={"d2": "home-far"},  # d1 has no home address
    )
    (assigned,) = plan_assignments(repo, "z", WEEK, "UTC").plan.assigned
    assert assigned.driver_uuid == "d2"
