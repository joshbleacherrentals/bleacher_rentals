from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException

from python_api.auto_work_trackers.google_routes import fetch_road_legs
from python_api.auto_work_trackers.repository import WorkTrackerRepository
from python_api.auto_work_trackers.road_times import load_road_times
from python_api.auto_work_trackers.schemas import (
    AcceptedCreated,
    AcceptedSkipped,
    AcceptRequest,
    AcceptResponse,
    CreatedTrip,
    GenerateRequest,
    GenerateResponse,
    PlannedTrip,
    PlanResponse,
    SuggestedTrip,
    SuggestRequest,
    SuggestResponse,
    TravelSources,
    UnassignedTrip,
)
from python_api.auto_work_trackers.service import (
    AcceptedTrip,
    InvalidWeekError,
    accept_trips,
    generate_assigned_work_trackers,
    plan_assignments,
    suggest_trips,
    work_tracker_date,
)
from python_api.core import settings
from python_api.core.supabase import SupabaseRest

router = APIRouter(prefix="/api/py/auto-work-trackers")


def _check_timezone(tz: str) -> None:
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, f"Unknown timezone {tz!r}.")


def _road_times(repo: WorkTrackerRepository):
    """Road times for a run: the RouteCache, then Google for the rest (when a key is set)."""
    key = settings.google_maps_key()
    fetch = (lambda pairs: fetch_road_legs(pairs, key)) if key else None
    return lambda pairs: load_road_times(pairs, repo, fetch, datetime.now(timezone.utc))


def _travel_json(stats) -> TravelSources:
    return TravelSources(google=stats.google, cached=stats.cached, estimated=stats.estimated)


def _unassigned_json(u) -> UnassignedTrip:
    return UnassignedTrip(
        bleacher_uuid=u.trip.bleacher_uuid,
        bleacher_number=u.trip.bleacher_number,
        from_street=u.trip.from_street,
        to_street=u.trip.to_street,
        earliest_day=u.trip.earliest_day,
        latest_day=u.trip.latest_day,
        reason=u.reason,
    )


@router.post("/generate", response_model=GenerateResponse)
def generate(body: GenerateRequest) -> GenerateResponse:
    """Plan the week as driver routes and create a draft work tracker for each trip that fits: its
    driver and day, the trip it follows that day, suggested times and estimated legs."""
    _check_timezone(body.timezone)

    repo = WorkTrackerRepository(SupabaseRest.from_env())
    try:
        result = generate_assigned_work_trackers(
            repo, body.zone_id, body.week_start, body.timezone, load_travel=_road_times(repo)
        )
    except InvalidWeekError as e:
        raise HTTPException(422, str(e))

    assigned = result.plan.assigned
    return GenerateResponse(
        bleachers_in_zone=result.bleachers_in_zone,
        bleachers_needing_trips=len({a.trip.bleacher_uuid for a in assigned})
        + len({u.trip.bleacher_uuid for u in result.plan.unassigned}),
        created=[
            CreatedTrip(
                work_tracker_id=wt_id,
                bleacher_uuid=a.trip.bleacher_uuid,
                bleacher_number=a.trip.bleacher_number,
                from_street=a.trip.from_street,
                to_street=a.trip.to_street,
                date=a.date,
                driver_uuid=a.driver_uuid,
                sequence=a.sequence,
                previous_work_tracker_id=(
                    result.work_tracker_ids[a.previous_index] if a.previous_index is not None else None
                ),
                planned_pickup_at=a.planned_pickup_at,
                planned_dropoff_at=a.planned_dropoff_at,
            )
            for a, wt_id in zip(assigned, result.work_tracker_ids, strict=True)
        ],
        unassigned=[_unassigned_json(u) for u in result.plan.unassigned],
        travel=_travel_json(result.travel),
    )


@router.post("/suggest", response_model=SuggestResponse)
def suggest(body: SuggestRequest) -> SuggestResponse:
    """The trips `generate` would create, without creating them."""
    _check_timezone(body.timezone)
    repo = WorkTrackerRepository(SupabaseRest.from_env())
    try:
        result = suggest_trips(repo, body.zone_id, body.week_start, body.timezone)
    except InvalidWeekError as e:
        raise HTTPException(422, str(e))

    return SuggestResponse(
        bleachers_in_zone=result.bleachers_in_zone,
        trips=[
            SuggestedTrip(
                bleacher_uuid=t.bleacher_uuid,
                bleacher_number=t.bleacher_number,
                from_address_uuid=t.from_address_uuid,
                to_address_uuid=t.to_address_uuid,
                from_street=t.from_street,
                to_street=t.to_street,
                from_event_uuid=t.from_event_uuid,
                to_event_uuid=t.to_event_uuid,
                date=day,
                available_from=t.available_from,
                must_arrive_by=t.must_arrive_by,
            )
            for t, day in zip(result.trips, result.dates, strict=True)
        ],
    )


@router.post("/accept", response_model=AcceptResponse)
def accept(body: AcceptRequest) -> AcceptResponse:
    """Create draft work trackers for the trips a person accepted, inside the selected week only."""
    _check_timezone(body.timezone)
    repo = WorkTrackerRepository(SupabaseRest.from_env())
    trips = [
        AcceptedTrip(t.bleacher_uuid, t.date, t.from_address_uuid, t.to_address_uuid, t.driver_uuid)
        for t in body.trips
    ]
    try:
        result = accept_trips(repo, body.week_start, trips, body.timezone)
    except InvalidWeekError as e:
        raise HTTPException(422, str(e))

    return AcceptResponse(
        created=[AcceptedCreated(**c.__dict__) for c in result.created],
        skipped=[AcceptedSkipped(**s.__dict__) for s in result.skipped],
    )


@router.post("/plan", response_model=PlanResponse)
def plan(body: SuggestRequest) -> PlanResponse:
    """Plan the zone's trips as driver routes (several a day, one bleacher at a time, 12 hours at
    most). Creates nothing."""
    _check_timezone(body.timezone)
    repo = WorkTrackerRepository(SupabaseRest.from_env())
    try:
        result = plan_assignments(
            repo, body.zone_id, body.week_start, body.timezone, load_travel=_road_times(repo)
        )
    except InvalidWeekError as e:
        raise HTTPException(422, str(e))

    return PlanResponse(
        bleachers_in_zone=result.bleachers_in_zone,
        drivers_in_zone=result.drivers_in_zone,
        assigned=[
            PlannedTrip(
                bleacher_uuid=a.trip.bleacher_uuid,
                bleacher_number=a.trip.bleacher_number,
                from_address_uuid=a.trip.from_address_uuid,
                to_address_uuid=a.trip.to_address_uuid,
                from_street=a.trip.from_street,
                to_street=a.trip.to_street,
                driver_uuid=a.driver_uuid,
                date=a.date,
                sequence=a.sequence,
                previous_index=a.previous_index,
                planned_pickup_at=a.planned_pickup_at,
                planned_dropoff_at=a.planned_dropoff_at,
                distance_m=a.distance_m,
                haul_m=a.haul.meters if a.haul else None,
                return_home_m=a.return_home.meters if a.return_home else None,
            )
            for a in result.plan.assigned
        ],
        unassigned=[_unassigned_json(u) for u in result.plan.unassigned],
        travel=_travel_json(result.travel),
    )
