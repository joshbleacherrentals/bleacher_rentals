from fastapi import FastAPI
from fastapi.testclient import TestClient

from python_api.auto_work_trackers.router import router
from python_api.auto_work_trackers.routing import NO_ROOM, NO_VEHICLE, TOO_LONG_FOR_A_DAY, solve
from python_api.auto_work_trackers.schemas import SolveRequest, SolveTrip, SolveVehicle

# Places: 0 home, 1 home2 (farther), 2 A, 3 X, 4 B, 5 Y, 6 FAR. Minutes = costs / 1000.
COORDS = [0, 200, 10, 20, 25, 35, 300]


def matrices():
    minutes = [[abs(a - b) for b in COORDS] for a in COORDS]
    costs = [[m * 1000 for m in row] for row in minutes]
    return minutes, costs


def request(trips, vehicles, **kw):
    minutes, costs = matrices()
    return SolveRequest(minutes=minutes, costs=costs, trips=trips, vehicles=vehicles, search_seconds=0, **kw)


V1 = SolveVehicle(id="d1|mon", home=0)


def test_two_nearby_trips_chain_on_one_day_one_bleacher_at_a_time():
    res = solve(request([SolveTrip(id="t1", pickup=2, dropoff=3, vehicles=["d1|mon"]), SolveTrip(id="t2", pickup=4, dropoff=5, vehicles=["d1|mon"])], [V1]))
    (route,) = res.routes
    assert route.vehicle == "d1|mon" and [s.trip for s in route.stops] == ["t1", "t2"]
    first, second = route.stops
    assert first.pickup_minute == 10 and first.dropoff_minute == 20
    assert second.pickup_minute >= first.dropoff_minute
    assert res.unplaced == []


def test_the_day_limit_holds_and_what_does_not_fit_has_no_room():
    trips = [SolveTrip(id=f"t{i}", pickup=2, dropoff=6, vehicles=["d1|mon"]) for i in (1, 2)]
    res = solve(request(trips, [V1], max_day_minutes=12 * 60))
    assert sum(len(r.stops) for r in res.routes) == 1
    assert [u.reason for u in res.unplaced] == [NO_ROOM]


def test_too_long_alone_and_no_vehicle_say_so():
    res = solve(request([SolveTrip(id="long", pickup=2, dropoff=6, vehicles=["d1|mon"]), SolveTrip(id="none", pickup=2, dropoff=3, vehicles=[])], [V1], max_day_minutes=200))
    assert {u.trip: u.reason for u in res.unplaced} == {"long": TOO_LONG_FOR_A_DAY, "none": NO_VEHICLE}


def test_a_trip_only_goes_on_a_vehicle_it_allows():
    near, far = SolveVehicle(id="near", home=0), SolveVehicle(id="far", home=1)
    res = solve(request([SolveTrip(id="t", pickup=2, dropoff=3, vehicles=["far"])], [near, far]))
    assert [r.vehicle for r in res.routes] == ["far"]


def test_a_lone_trip_goes_to_the_driver_who_drives_less():
    near, far = SolveVehicle(id="near", home=0), SolveVehicle(id="far", home=1)
    res = solve(request([SolveTrip(id="t", pickup=2, dropoff=3, vehicles=["far", "near"])], [far, near]))
    assert [r.vehicle for r in res.routes] == ["near"]


def test_time_on_site_comes_before_driving_on():
    # home(0) -10-> A(2): 60 on site -10-> X(3): arrives at 80.
    trip = SolveTrip(id="t", pickup=2, dropoff=3, vehicles=["d1|mon"], pickup_minutes=60, dropoff_minutes=60)
    (route,) = solve(request([trip], [V1])).routes
    (stop,) = route.stops
    assert stop.pickup_minute == 10 and stop.dropoff_minute == 80


def test_time_on_site_counts_towards_the_day():
    # Alone: 10 + 60 + 10 + 60 + 20 home = 160 minutes.
    trip = SolveTrip(id="t", pickup=2, dropoff=3, vehicles=["d1|mon"], pickup_minutes=60, dropoff_minutes=60)
    assert [u.reason for u in solve(request([trip], [V1], max_day_minutes=159)).unplaced] == [TOO_LONG_FOR_A_DAY]
    assert solve(request([trip], [V1], max_day_minutes=160)).unplaced == []
    # Two of them chained: 10 + 60 + 10 + 60 + 10 back to A + 60 + 10 + 60 + 20 = 300.
    two = [trip, trip.model_copy(update={"id": "t2"})]
    assert [u.reason for u in solve(request(two, [V1], max_day_minutes=299)).unplaced] == [NO_ROOM]
    assert solve(request(two, [V1], max_day_minutes=300)).unplaced == []


def test_the_endpoint_answers_and_refuses_a_bad_request():
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    minutes, costs = matrices()
    ok = client.post("/api/py/auto-work-trackers/solve", json={"minutes": minutes, "costs": costs, "vehicles": [{"id": "d1|mon", "home": 0}], "trips": [{"id": "t1", "pickup": 2, "dropoff": 3, "vehicles": ["d1|mon"]}], "search_seconds": 0})
    assert ok.status_code == 200 and ok.json()["routes"][0]["stops"][0]["trip"] == "t1"
    bad = client.post("/api/py/auto-work-trackers/solve", json={"minutes": [[0]], "costs": [[0]], "vehicles": [{"id": "v", "home": 5}], "trips": []})
    assert bad.status_code == 422
