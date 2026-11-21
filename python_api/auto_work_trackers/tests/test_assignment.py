from python_api.auto_work_trackers.assignment import NO_WINDOW, OUTSIDE_WEEK, allowed_days
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


# Placing trips on drivers' days is tested in test_routing.py.
