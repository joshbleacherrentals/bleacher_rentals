import json

import httpx

from python_api.auto_work_trackers.google_routes import (
    MATRIX_URL,
    RoadLeg,
    blocks,
    fetch_road_legs,
    matrix_body,
    parse_matrix,
)

A, B, C = (43.1, -79.2), (43.2, -79.3), (43.3, -79.4)


def test_the_request_is_driving_with_no_traffic_and_no_tolls():
    body = matrix_body([A], [B, C])
    assert body["travelMode"] == "DRIVE" and body["routingPreference"] == "TRAFFIC_UNAWARE"
    assert body["origins"][0]["routeModifiers"] == {"avoidTolls": True}
    assert body["destinations"][1]["waypoint"]["location"]["latLng"] == {"latitude": 43.3, "longitude": -79.4}


def test_the_answer_is_read_by_origin_and_destination():
    elements = [
        {"originIndex": 0, "destinationIndex": 0, "condition": "ROUTE_EXISTS", "distanceMeters": 1200, "duration": "95s"},
        {"originIndex": 0, "destinationIndex": 1, "condition": "ROUTE_NOT_FOUND"},
        {"originIndex": 0, "destinationIndex": 1, "status": {"code": 3, "message": "bad"}},
    ]
    assert parse_matrix(elements, [A], [B, C]) == {(A, B): RoadLeg(True, 1200, 95), (A, C): RoadLeg(False)}


def test_blocks_stay_within_googles_cap_and_cover_every_pair():
    origins = [(43 + i / 100, -79.0) for i in range(30)]
    dests = [(44 + j / 100, -80.0) for j in range(30)]
    pairs = {(o, d) for o in origins for d in dests}
    out = blocks(pairs)
    assert all(len(o) * len(d) <= 625 for o, d in out)
    covered = {(o, d) for os_, ds in out for o in os_ for d in ds}
    assert pairs <= covered


def test_fetch_asks_google_and_keeps_only_the_pairs_wanted():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        body = json.loads(request.content)
        elements = [
            {"originIndex": i, "destinationIndex": j, "condition": "ROUTE_EXISTS", "distanceMeters": 1000 * (i + j + 1), "duration": "60s"}
            for i in range(len(body["origins"]))
            for j in range(len(body["destinations"]))
        ]
        return httpx.Response(200, json=elements)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    legs = fetch_road_legs({(A, B), (A, C)}, "KEY", client)
    assert set(legs) == {(A, B), (A, C)}
    assert str(seen[0].url) == MATRIX_URL
    assert seen[0].headers["X-Goog-Api-Key"] == "KEY"
    assert "distanceMeters" in seen[0].headers["X-Goog-FieldMask"]


def test_a_failed_block_is_simply_missing():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(403, json={"error": {}})))
    assert fetch_road_legs({(A, B)}, "KEY", client) == {}
