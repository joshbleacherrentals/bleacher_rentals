from python_api.auto_work_trackers.dates import is_monday, to_local_date, week_end_of


def test_timestamp_is_read_as_the_day_in_the_given_zone():
    assert to_local_date("2026-11-10T02:00:00+00:00", "America/Edmonton") == "2026-11-09"
    assert to_local_date("2026-11-10 02:00:00+00", "UTC") == "2026-11-10"


def test_plain_dates_and_missing_values():
    assert to_local_date("2026-11-09", "America/Edmonton") == "2026-11-09"
    assert to_local_date(None, "UTC") is None
    assert to_local_date("nonsense", "UTC") is None


def test_monday_and_week_end():
    assert is_monday("2026-11-09") and not is_monday("2026-11-10") and not is_monday("x")
    assert week_end_of("2026-11-09") == "2026-11-15"
