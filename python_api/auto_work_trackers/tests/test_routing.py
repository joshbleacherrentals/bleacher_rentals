from datetime import datetime
from zoneinfo import ZoneInfo

from python_api.auto_work_trackers.assignment import NO_FREE_DRIVER_DAY, NO_WINDOW, TOO_LONG_FOR_A_DAY
from python_api.auto_work_trackers.models import NeededTrip
from python_api.auto_work_trackers.routing import MAX_DAY_MINUTES, RouteDriver, plan_routes

WEEK = "2026-11-09"
MON, TUE, WED = "2026-11-09", "2026-11-10", "2026-11-11"

# Around Calgary: a few km apart, except FAR (~280 km, Edmonton) and VERY_FAR (~1,000 km, Winnipeg-ish).
POINTS = {
    "home": (51.05, -114.07),
    "home2": (51.30, -114.40),
    "a": (51.06, -114.08),
    "x": (51.10, -114.10),
    "b": (51.11, -114.11),
    "y": (51.15, -114.15),
    "far": (53.55, -113.49),
    "very_far": (49.90, -97.14),
}


def point_of(address):
    return POINTS.get(address)


def trip(n, frm, to, first=MON, last=WED):
    return NeededTrip(
        bleacher_uuid=f"b{n}",
        bleacher_number=n,
        from_address_uuid=frm,
        from_street=frm,
        to_address_uuid=to,
        to_street=to,
        from_event_uuid=f"e{n}a",
        to_event_uuid=f"e{n}b",
        available_from=first,
        must_arrive_by=last,
        earliest_day=first,
        latest_day=last,
    )


DRIVER = RouteDriver("d1", POINTS["home"])


def plan(trips, drivers=(DRIVER,), blocked=(), tz="UTC"):
    return plan_routes(trips, list(drivers), set(blocked), WEEK, point_of, tz, search_seconds=0)


def test_two_nearby_trips_chain_into_one_day_one_bleacher_at_a_time():
    result = plan([trip(1, "a", "x", MON, MON), trip(2, "b", "y", MON, MON)])
    assert [(a.trip.bleacher_number, a.date, a.sequence) for a in result.assigned] == [
        (1, MON, 1),
        (2, MON, 2),
    ]
    first, second = result.assigned
    assert first.previous_index is None and second.previous_index == 0
    # the second trip's deadhead starts at the first drop-off, and only the last trip drives home
    assert second.deadhead_in.meters < first.haul.meters
    assert first.return_home is None and second.return_home is not None
    # one bleacher at a time: the second pickup is after the first drop-off
    assert second.planned_pickup_at >= first.planned_dropoff_at


def test_suggested_times_count_from_seven_in_the_zone_time():
    (only,) = plan([trip(1, "a", "x", MON, MON)], tz="America/Edmonton").assigned
    pickup = datetime.fromisoformat(only.planned_pickup_at)
    assert pickup.utcoffset() == datetime.fromisoformat(MON).replace(tzinfo=ZoneInfo("America/Edmonton")).utcoffset()
    assert (pickup.hour, pickup.date().isoformat()) == (7, MON)  # a couple of minutes from home
    assert only.planned_dropoff_at > only.planned_pickup_at


def test_a_day_never_goes_over_twelve_hours():
    # Each trip is a ~280 km haul and back: about 9 hours, so two never share a day.
    trips = [trip(1, "a", "far", MON, MON), trip(2, "b", "far", MON, MON)]
    result = plan(trips)
    assert len(result.assigned) == 1
    assert [u.reason for u in result.unassigned] == [NO_FREE_DRIVER_DAY]

    two_days = plan([trip(1, "a", "far", MON, TUE), trip(2, "b", "far", MON, TUE)])
    assert sorted(a.date for a in two_days.assigned) == [MON, TUE]
    for a in two_days.assigned:
        day = a.deadhead_in.clock_minutes + a.haul.clock_minutes + a.return_home.clock_minutes
        assert day <= MAX_DAY_MINUTES


def test_a_trip_too_long_even_alone_says_so():
    result = plan([trip(1, "a", "very_far")])
    assert [u.reason for u in result.unassigned] == [TOO_LONG_FOR_A_DAY]


def test_trips_stay_inside_their_days_and_off_blocked_days():
    result = plan([trip(1, "a", "x", MON, TUE)], blocked={("d1", MON)})
    assert [a.date for a in result.assigned] == [TUE]


def test_trips_without_a_window_or_a_driver_say_why():
    assert [u.reason for u in plan([trip(1, "a", "x", TUE, MON)]).unassigned] == [NO_WINDOW]
    assert [u.reason for u in plan([trip(1, "a", "x")], drivers=()).unassigned] == [NO_FREE_DRIVER_DAY]


def test_the_trip_goes_to_the_driver_who_drives_less():
    near = RouteDriver("d-near", POINTS["home"])
    away = RouteDriver("d-away", POINTS["home2"])
    (only,) = plan([trip(1, "a", "x", MON, MON)], drivers=(away, near)).assigned
    assert only.driver_uuid == "d-near"


def test_unknown_coordinates_still_get_planned_with_a_cautious_clock():
    (only,) = plan([trip(1, "nowhere", "x", MON, MON)]).assigned
    assert only.deadhead_in.meters is None and only.haul.meters is None
    assert only.return_home.meters is not None


def test_the_improving_search_keeps_the_rules():
    trips = [trip(n, frm, to) for n, (frm, to) in enumerate([("a", "x"), ("b", "y"), ("x", "a"), ("y", "b")], 1)]
    drivers = [DRIVER, RouteDriver("d2", POINTS["home2"])]
    result = plan_routes(trips, drivers, set(), WEEK, point_of, "UTC", search_seconds=0.3)
    assert len(result.assigned) == 4 and not result.unassigned
    days: dict[tuple[str, str], list] = {}
    for a in result.assigned:
        days.setdefault((a.driver_uuid, a.date), []).append(a)
    for day in days.values():
        day.sort(key=lambda a: a.sequence)
        for before, after in zip(day, day[1:]):
            assert after.planned_pickup_at >= before.planned_dropoff_at
