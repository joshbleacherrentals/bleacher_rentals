"""Date helpers. Dates are "YYYY-MM-DD" strings, which compare correctly as text."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo


def to_local_date(value: str | None, tz: str) -> str | None:
    """The calendar day of a database timestamp in `tz` (the viewer's own day, as the app shows it).

    A plain date or a timestamp without an offset is taken as already being that day.
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace(" ", "T"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(ZoneInfo(tz))
    return parsed.date().isoformat()


def is_monday(day: str) -> bool:
    try:
        return date.fromisoformat(day).weekday() == 0
    except ValueError:
        return False


def week_end_of(week_start: str) -> str:
    return (date.fromisoformat(week_start) + timedelta(days=6)).isoformat()


def day_after(day: str) -> str:
    return (date.fromisoformat(day) + timedelta(days=1)).isoformat()
