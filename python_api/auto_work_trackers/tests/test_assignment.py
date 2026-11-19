from python_api.auto_work_trackers.assignment import (
    NO_FREE_DRIVER_DAY,
    NO_WINDOW,
    OUTSIDE_WEEK,
    allowed_days,
    assign_trips,
)
from python_api.auto_work_trackers.models import NeededTrip

WEEK = "2026-11-09"  # Monday; the week ends Sunday 2026-11-15


def trip(bleacher="b1", earliest="2026-11-09", latest="2026-11-11"):
    return NeededTrip(bleacher, 1, "a1", "1 Main", "a2", "2 Oak", "e1", "e2", earliest, latest, earliest, latest)


def test_the_window_is_the_days_between_the_events_inside_the_week():
    assert allowed_days(trip(earliest="2026-11-05", latest="2026-11-10"), WEEK) == (["2026-11-09", "2026-11-10"], None)
    assert allowed_days(trip(earliest="2026-11-14", latest="2026-11-20"), WEEK) == (["2026-11-14", "2026-11-15"], None)


def test_back_to_back_events_leave_no_window():
    # first event ends the 10th, next starts the 11th: the 11th is the day after the end but also the start day
    assert allowed_days(trip(earliest="2026-11-11", latest="2026-11-10"), WEEK) == ([], NO_WINDOW)


def test_a_window_wholly_outside_the_week_is_reported():
    assert allowed_days(trip(earliest="2026-11-20", latest="2026-11-25"), WEEK) == ([], OUTSIDE_WEEK)


def test_each_trip_gets_a_driver_and_a_day_inside_its_window():
    result = assign_trips([trip()], ["d1"], set(), WEEK)
    (a,) = result.assigned
    assert a.driver_uuid == "d1" and "2026-11-09" <= a.date <= "2026-11-11"
    assert result.unassigned == []


def test_a_driver_never_does_two_trips_on_one_day():
    trips = [trip("b1", "2026-11-09", "2026-11-10"), trip("b2", "2026-11-09", "2026-11-10"), trip("b3", "2026-11-09", "2026-11-10")]
    result = assign_trips(trips, ["d1"], set(), WEEK)
    slots = [(a.driver_uuid, a.date) for a in result.assigned]
    assert len(slots) == len(set(slots)) == 2  # one driver, two days
    assert [u.reason for u in result.unassigned] == [NO_FREE_DRIVER_DAY]


def test_more_drivers_let_more_trips_share_a_day():
    trips = [trip(f"b{i}", "2026-11-09", "2026-11-09") for i in range(3)]
    result = assign_trips(trips, ["d1", "d2", "d3"], set(), WEEK)
    assert len(result.assigned) == 3
    assert {a.driver_uuid for a in result.assigned} == {"d1", "d2", "d3"}


def test_blocked_driver_days_are_not_used():
    blocked = {("d1", "2026-11-09"), ("d1", "2026-11-10")}
    result = assign_trips([trip(earliest="2026-11-09", latest="2026-11-11")], ["d1"], blocked, WEEK)
    assert [(a.driver_uuid, a.date) for a in result.assigned] == [("d1", "2026-11-11")]


def test_the_most_trips_possible_are_placed_even_when_greedy_would_block_one():
    # Trip A fits Monday or Tuesday; trip B fits only Monday. A must not take Monday.
    a = trip("a", "2026-11-09", "2026-11-10")
    b = trip("b", "2026-11-09", "2026-11-09")
    result = assign_trips([a, b], ["d1"], set(), WEEK)
    assert len(result.assigned) == 2
    days = {x.trip.bleacher_uuid: x.date for x in result.assigned}
    assert days == {"a": "2026-11-10", "b": "2026-11-09"}


def test_trips_that_cannot_be_placed_say_why():
    result = assign_trips(
        [trip(earliest="2026-11-11", latest="2026-11-10"), trip(earliest="2026-11-20", latest="2026-11-22"), trip()],
        [],
        set(),
        WEEK,
    )
    assert [u.reason for u in result.unassigned] == [NO_WINDOW, OUTSIDE_WEEK, NO_FREE_DRIVER_DAY]
    assert result.assigned == []


def test_the_same_input_always_gives_the_same_answer():
    trips = [trip(f"b{i}") for i in range(4)]
    one = assign_trips(trips, ["d2", "d1"], set(), WEEK)
    two = assign_trips(trips, ["d1", "d2"], set(), WEEK)
    assert [(a.driver_uuid, a.date) for a in one.assigned] == [(a.driver_uuid, a.date) for a in two.assigned]


def test_a_trip_without_a_strict_window_falls_back_to_its_old_one():
    legacy = NeededTrip("b", 1, "a", "s", "c", "t", "e1", "e2", "2026-11-10", "2026-11-11")
    assert allowed_days(legacy, WEEK) == (["2026-11-10", "2026-11-11"], None)


def test_the_nearest_driver_wins():
    distances = {"d1": 9_000, "d2": 1_000, "d3": 5_000}
    result = assign_trips([trip()], ["d1", "d2", "d3"], set(), WEEK, lambda d, t: distances[d])
    (assigned,) = result.assigned
    assert (assigned.driver_uuid, assigned.distance_m) == ("d2", 1_000)


def test_nearness_beats_an_earlier_day():
    # d1 is nearest but only free on the 11th; d2 is free on the 9th but farther.
    blocked = {("d1", "2026-11-09"), ("d1", "2026-11-10")}
    result = assign_trips([trip()], ["d1", "d2"], blocked, WEEK, lambda d, t: {"d1": 100, "d2": 5_000}[d])
    assert [(a.driver_uuid, a.date) for a in result.assigned] == [("d1", "2026-11-11")]


def test_the_same_driver_takes_the_earliest_day_when_distance_ties():
    result = assign_trips([trip()], ["d1"], set(), WEEK, lambda d, t: 500)
    assert result.assigned[0].date == "2026-11-09"


def test_total_distance_is_as_small_as_possible_across_trips():
    # t1 is near d1 (100) and far from d2 (900); t2 is near d1 (200) and a little farther from d2 (250).
    # d1 can take one trip a day and both trips are only possible on one day:
    # t1->d1 + t2->d2 costs 350; t1->d2 + t2->d1 costs 1100.
    table = {("d1", "t1"): 100, ("d2", "t1"): 900, ("d1", "t2"): 200, ("d2", "t2"): 250}
    t1 = trip("t1", "2026-11-09", "2026-11-09")
    t2 = trip("t2", "2026-11-09", "2026-11-09")
    result = assign_trips([t1, t2], ["d1", "d2"], set(), WEEK, lambda d, t: table[(d, t.bleacher_uuid)])
    assert {a.trip.bleacher_uuid: a.driver_uuid for a in result.assigned} == {"t1": "d1", "t2": "d2"}


def test_placing_more_trips_matters_more_than_distance():
    # One driver. t1 fits the 9th or 10th, t2 only the 9th. t1 is "nearer" on the 9th in no sense (one
    # driver, one distance), so this checks that cost never costs a trip: both must be placed.
    t1 = trip("t1", "2026-11-09", "2026-11-10")
    t2 = trip("t2", "2026-11-09", "2026-11-09")
    result = assign_trips([t1, t2], ["d1"], set(), WEEK, lambda d, t: 100)
    assert {a.trip.bleacher_uuid: a.date for a in result.assigned} == {"t1": "2026-11-10", "t2": "2026-11-09"}


def test_an_unknown_distance_counts_as_farther_than_any_real_one():
    result = assign_trips(
        [trip()], ["d1", "d2"], set(), WEEK, lambda d, t: None if d == "d1" else 19_000_000
    )
    (assigned,) = result.assigned
    assert (assigned.driver_uuid, assigned.distance_m) == ("d2", 19_000_000)
