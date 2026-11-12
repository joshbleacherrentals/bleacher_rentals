from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException

from python_api.auto_work_trackers.repository import WorkTrackerRepository
from python_api.auto_work_trackers.schemas import CreatedTrip, GenerateRequest, GenerateResponse
from python_api.auto_work_trackers.service import InvalidWeekError, generate_work_trackers, work_tracker_date
from python_api.core.supabase import SupabaseRest

router = APIRouter(prefix="/api/py/auto-work-trackers")


@router.post("/generate", response_model=GenerateResponse)
def generate(body: GenerateRequest) -> GenerateResponse:
    try:
        ZoneInfo(body.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(422, f"Unknown timezone {body.timezone!r}.")

    repo = WorkTrackerRepository(SupabaseRest.from_env())
    try:
        result = generate_work_trackers(repo, body.zone_id, body.week_start, body.timezone)
    except InvalidWeekError as e:
        raise HTTPException(422, str(e))

    return GenerateResponse(
        bleachers_in_zone=result.bleachers_in_zone,
        bleachers_needing_trips=len({t.bleacher_uuid for t in result.trips}),
        created=[
            CreatedTrip(
                work_tracker_id=wt_id,
                bleacher_uuid=t.bleacher_uuid,
                bleacher_number=t.bleacher_number,
                from_street=t.from_street,
                to_street=t.to_street,
                date=work_tracker_date(t, body.week_start),
            )
            for t, wt_id in zip(result.trips, result.work_tracker_ids, strict=True)
        ],
    )
