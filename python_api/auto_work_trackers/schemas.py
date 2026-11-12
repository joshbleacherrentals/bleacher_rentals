from pydantic import BaseModel


class GenerateRequest(BaseModel):
    zone_id: str
    week_start: str  # a Monday, "YYYY-MM-DD"
    timezone: str = "America/Edmonton"  # the viewer's, so event days match what they see


class CreatedTrip(BaseModel):
    work_tracker_id: str
    bleacher_uuid: str
    bleacher_number: int | None
    from_street: str
    to_street: str
    date: str


class GenerateResponse(BaseModel):
    bleachers_in_zone: int
    bleachers_needing_trips: int
    created: list[CreatedTrip]
