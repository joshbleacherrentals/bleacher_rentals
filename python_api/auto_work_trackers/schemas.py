from pydantic import BaseModel


class GenerateRequest(BaseModel):
    zone_id: str
    week_start: str  # a Monday, "YYYY-MM-DD"
    timezone: str = "America/Edmonton"  # the viewer's, so event days match what they see


class SuggestRequest(GenerateRequest):
    """The same question as `generate`, answered without creating anything."""


class UnassignedTrip(BaseModel):
    bleacher_uuid: str
    bleacher_number: int | None
    from_street: str
    to_street: str
    earliest_day: str | None
    latest_day: str | None
    reason: str  # "no_window" | "outside_week" | "no_free_driver_day" | "too_long_for_a_day"


class CreatedTrip(BaseModel):
    work_tracker_id: str
    bleacher_uuid: str
    bleacher_number: int | None
    from_street: str
    to_street: str
    date: str
    driver_uuid: str | None = None
    sequence: int = 1  # the trip's place in the driver's day
    previous_work_tracker_id: str | None = None  # the trip it drives on from; None: from home
    planned_pickup_at: str | None = None
    planned_dropoff_at: str | None = None


class TravelSources(BaseModel):
    """Where a run's road legs came from: Google just now, the cache, or a straight-line estimate."""

    google: int = 0
    cached: int = 0
    estimated: int = 0


class GenerateResponse(BaseModel):
    bleachers_in_zone: int
    bleachers_needing_trips: int
    created: list[CreatedTrip]
    unassigned: list[UnassignedTrip] = []
    travel: TravelSources = TravelSources()


class SuggestedTrip(BaseModel):
    bleacher_uuid: str
    bleacher_number: int | None
    from_address_uuid: str | None
    to_address_uuid: str | None
    from_street: str
    to_street: str
    from_event_uuid: str
    to_event_uuid: str
    date: str  # where the draft would be dated, inside the week
    available_from: str
    must_arrive_by: str


class SuggestResponse(BaseModel):
    bleachers_in_zone: int
    trips: list[SuggestedTrip]


class AcceptedTripIn(BaseModel):
    bleacher_uuid: str
    date: str
    from_address_uuid: str | None = None
    to_address_uuid: str | None = None
    driver_uuid: str | None = None


class AcceptRequest(BaseModel):
    week_start: str  # a Monday, "YYYY-MM-DD"; trips outside this week are skipped
    trips: list[AcceptedTripIn]
    timezone: str = "America/Edmonton"


class AcceptedCreated(BaseModel):
    work_tracker_id: str
    bleacher_uuid: str
    date: str


class AcceptedSkipped(BaseModel):
    bleacher_uuid: str
    date: str
    reason: str


class AcceptResponse(BaseModel):
    created: list[AcceptedCreated]
    skipped: list[AcceptedSkipped]


class PlannedTrip(BaseModel):
    bleacher_uuid: str
    bleacher_number: int | None
    from_address_uuid: str | None
    to_address_uuid: str | None
    from_street: str
    to_street: str
    driver_uuid: str
    date: str
    sequence: int = 1  # the trip's place in the driver's day
    previous_index: int | None = None  # index in `assigned` of the trip it drives on from
    planned_pickup_at: str | None = None
    planned_dropoff_at: str | None = None
    distance_m: int | None = None  # estimated deadhead to the pickup; None when unknown
    haul_m: int | None = None  # estimated pickup to drop-off
    return_home_m: int | None = None  # estimated drive home; only on the day's last trip


class PlanResponse(BaseModel):
    bleachers_in_zone: int
    drivers_in_zone: int
    assigned: list[PlannedTrip]
    unassigned: list[UnassignedTrip]
    travel: TravelSources = TravelSources()
