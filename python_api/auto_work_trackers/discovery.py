"""Finds the trips a set of bleachers needs, from where their events put them.

A bleacher must be at an event's address from the event's start to its end. Between two events at
different addresses it has to move: that move is a trip needed, doable on any day after the
first event's last day to the second event's start (its window). Work trackers already made for the bleacher
inside that window count as part of the move: one that picks the bleacher up where it is carries it
to its drop-off, and only the rest of the way is still needed.

Pure: no database, no clock. A port of src/features/autoWorkTrackers/utils/discoverTrips.ts.
"""

from python_api.auto_work_trackers.dates import day_after, week_end_of
from python_api.auto_work_trackers.models import BleacherInput, NeededTrip
from python_api.auto_work_trackers.streets import normalize_street


def _trips_for_bleacher(bleacher: BleacherInput, week_start: str, week_end: str) -> list[NeededTrip]:
    stops = sorted(
        (s for s in bleacher.stops if normalize_street(s.street) != ""),
        key=lambda s: (s.start_date, s.end_date),
    )
    needed: list[NeededTrip] = []

    for origin, target in zip(stops, stops[1:]):
        target_key = normalize_street(target.street)
        if normalize_street(origin.street) == target_key:
            continue

        # The bleacher is collected the day after its event ends, never on the last day itself. If the
        # next event starts before that, the move is already due, so it opens on that day.
        must_arrive_by = target.start_date
        available_from = min(day_after(origin.end_date), must_arrive_by)
        # The window has to touch the selected week, but may start long before it or end long after.
        if available_from > week_end or must_arrive_by < week_start:
            continue

        # Follow the work trackers already in the window: each one that picks the bleacher up where
        # it currently is moves it on to its drop-off.
        position_street, position_address = origin.street, origin.address_uuid
        in_window = sorted(
            (t for t in bleacher.trips if t.date is not None and available_from <= t.date <= must_arrive_by),
            key=lambda t: t.date,
        )
        for trip in in_window:
            if normalize_street(trip.dropoff_street) == "":
                continue
            if normalize_street(trip.pickup_street) == normalize_street(position_street):
                position_street, position_address = trip.dropoff_street, trip.dropoff_address_uuid

        if normalize_street(position_street) == target_key:
            continue

        needed.append(
            NeededTrip(
                bleacher_uuid=bleacher.bleacher_uuid,
                bleacher_number=bleacher.bleacher_number,
                from_address_uuid=position_address,
                from_street=position_street or "",
                to_address_uuid=target.address_uuid,
                to_street=target.street or "",
                from_event_uuid=origin.event_uuid,
                to_event_uuid=target.event_uuid,
                available_from=available_from,
                must_arrive_by=must_arrive_by,
            )
        )
    return needed


def discover_trips(bleachers: list[BleacherInput], week_start: str) -> list[NeededTrip]:
    """Every trip needed whose window touches the week starting `week_start` (a Monday).

    Ordered by bleacher number, then by when the move opens.
    """
    week_end = week_end_of(week_start)
    trips = [t for b in bleachers for t in _trips_for_bleacher(b, week_start, week_end)]
    return sorted(trips, key=lambda t: (t.bleacher_number is None, t.bleacher_number or 0, t.available_from))
