"""The Auto Work Trackers solver endpoint. Pure: everything comes in the request (see schemas.py);
no database, no network. The TypeScript planner calls it and writes the work trackers."""

from fastapi import APIRouter, HTTPException

from python_api.auto_work_trackers.routing import InvalidSolveRequest, solve
from python_api.auto_work_trackers.schemas import SolveRequest, SolveResponse

router = APIRouter(prefix="/api/py/auto-work-trackers")


@router.post("/solve", response_model=SolveResponse)
def solve_endpoint(body: SolveRequest) -> SolveResponse:
    """Place the trips on the vehicles (driver-days): see routing.solve."""
    try:
        return solve(body)
    except InvalidSolveRequest as e:
        raise HTTPException(422, str(e))
