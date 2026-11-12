from python_api.auto_work_trackers.discovery import discover_trips
from python_api.auto_work_trackers.models import BleacherInput, ExistingTrip, Stop
from python_api.auto_work_trackers.streets import normalize_street

WEEK = "2026-11-09"  # Monday; the week ends Sunday 2026-11-15


def stop(name, street, start, end, address=None):
    return Stop(name, name, address or f"addr-{name}", street, start, end)


def bleacher(stops, trips=(), number=1):
    return BleacherInput(f"b{number}", number, list(stops), list(trips))


def test_normalize_street_ignores_case_punctuation_and_spacing():
    assert normalize_street("  123 Main St., NW ") == normalize_street("123 main st nw")
    assert normalize_street(None) == ""


def test_a_move_between_two_addresses_is_needed():
    b = bleacher([stop("a", "1 Main St", "2026-11-01", "2026-11-08"), stop("b", "9 Oak Ave", "2026-11-12", "2026-11-14")])
    (trip,) = discover_trips([b], WEEK)
    assert (trip.from_street, trip.to_street) == ("1 Main St", "9 Oak Ave")
    assert (trip.from_address_uuid, trip.to_address_uuid) == ("addr-a", "addr-b")
    assert (trip.available_from, trip.must_arrive_by) == ("2026-11-09", "2026-11-12")


def test_same_street_text_under_different_address_ids_needs_no_move():
    b = bleacher([stop("a", "1 Main St.", "2026-11-01", "2026-11-08", "id1"), stop("b", "1 main st", "2026-11-12", "2026-11-14", "id2")])
    assert discover_trips([b], WEEK) == []


def test_window_must_touch_the_week():
    before = bleacher([stop("a", "1 Main", "2026-10-01", "2026-10-05"), stop("b", "2 Oak", "2026-10-08", "2026-10-09")])
    after = bleacher([stop("a", "1 Main", "2026-11-20", "2026-11-22"), stop("b", "2 Oak", "2026-11-25", "2026-11-26")])
    assert discover_trips([before, after], WEEK) == []


def test_window_can_start_before_and_end_after_the_week():
    b = bleacher([stop("a", "1 Main", "2026-10-01", "2026-10-05"), stop("b", "2 Oak", "2026-12-01", "2026-12-03")])
    assert len(discover_trips([b], WEEK)) == 1


def test_an_existing_work_tracker_in_the_window_covers_the_move():
    b = bleacher(
        [stop("a", "1 Main", "2026-11-01", "2026-11-08"), stop("b", "2 Oak", "2026-11-12", "2026-11-14")],
        [ExistingTrip("2026-11-10", "1 Main", "2 Oak", "addr-b")],
    )
    assert discover_trips([b], WEEK) == []


def test_a_partial_work_tracker_leaves_the_rest_of_the_way():
    b = bleacher(
        [stop("a", "1 Main", "2026-11-01", "2026-11-08"), stop("c", "3 Pine", "2026-11-13", "2026-11-14")],
        [ExistingTrip("2026-11-10", "1 Main", "2 Oak", "addr-yard")],
    )
    (trip,) = discover_trips([b], WEEK)
    assert (trip.from_street, trip.from_address_uuid, trip.to_street) == ("2 Oak", "addr-yard", "3 Pine")


def test_a_work_tracker_outside_the_window_or_from_elsewhere_does_not_count():
    stops = [stop("a", "1 Main", "2026-11-01", "2026-11-08"), stop("b", "2 Oak", "2026-11-12", "2026-11-14")]
    outside = bleacher(stops, [ExistingTrip("2026-11-01", "1 Main", "2 Oak", "x")])
    elsewhere = bleacher(stops, [ExistingTrip("2026-11-10", "7 Other", "2 Oak", "x")])
    assert len(discover_trips([outside, elsewhere], WEEK)) == 2


def test_events_without_a_street_are_skipped_and_the_rest_chain_through():
    b = bleacher([stop("a", "1 Main", "2026-11-01", "2026-11-08"), stop("x", None, "2026-11-09", "2026-11-10"), stop("b", "2 Oak", "2026-11-12", "2026-11-14")])
    (trip,) = discover_trips([b], WEEK)
    assert (trip.from_event_uuid, trip.to_event_uuid) == ("a", "b")


def test_results_are_ordered_by_bleacher_number_then_window_open():
    two = bleacher([stop("a", "1 Main", "2026-11-01", "2026-11-08"), stop("b", "2 Oak", "2026-11-12", "2026-11-14")], number=2)
    one = bleacher([stop("a", "1 Main", "2026-11-01", "2026-11-09"), stop("b", "2 Oak", "2026-11-12", "2026-11-14")], number=1)
    assert [t.bleacher_number for t in discover_trips([two, one], WEEK)] == [1, 2]


def test_an_event_ending_on_sunday_is_collected_the_next_week_not_this_one():
    b = bleacher([stop("a", "1 Main", "2026-11-10", "2026-11-15"), stop("b", "2 Oak", "2026-11-25", "2026-11-26")])
    assert discover_trips([b], WEEK) == []
    (trip,) = discover_trips([b], "2026-11-16")
    assert trip.available_from == "2026-11-16"


def test_an_event_ending_the_day_before_the_week_is_collected_on_its_first_day():
    b = bleacher([stop("a", "1 Main", "2026-11-01", "2026-11-08"), stop("b", "2 Oak", "2026-11-25", "2026-11-26")])
    assert discover_trips([b], WEEK)[0].available_from == "2026-11-09"


def test_a_next_event_starting_before_the_day_after_keeps_the_move_due_that_day():
    b = bleacher([stop("a", "1 Main", "2026-11-01", "2026-11-10"), stop("b", "2 Oak", "2026-11-10", "2026-11-14")])
    (trip,) = discover_trips([b], WEEK)
    assert (trip.available_from, trip.must_arrive_by) == ("2026-11-10", "2026-11-10")
