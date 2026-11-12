"""The shapes the trip discovery works with. Plain data: no database, no HTTP."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Stop:
    """One booked event: where a bleacher has to be, and the days it has to be there."""

    event_uuid: str
    event_name: str | None
    address_uuid: str | None
    street: str | None
    start_date: str  # "YYYY-MM-DD": setup start, else event start
    end_date: str  # "YYYY-MM-DD": teardown end, else event end


@dataclass(frozen=True)
class ExistingTrip:
    """A work tracker that already moves this bleacher."""

    date: str | None
    pickup_street: str | None
    dropoff_street: str | None
    dropoff_address_uuid: str | None


@dataclass(frozen=True)
class BleacherInput:
    bleacher_uuid: str
    bleacher_number: int | None
    stops: list[Stop] = field(default_factory=list)
    trips: list[ExistingTrip] = field(default_factory=list)


@dataclass(frozen=True)
class NeededTrip:
    bleacher_uuid: str
    bleacher_number: int | None
    from_address_uuid: str | None
    from_street: str
    to_address_uuid: str | None
    to_street: str
    from_event_uuid: str
    to_event_uuid: str
    available_from: str  # earliest day the move can happen: the day after the first event's last day
    must_arrive_by: str  # latest day: the day the next event starts
