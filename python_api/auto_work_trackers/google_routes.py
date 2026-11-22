"""Real road distances and drive times from Google: Routes API, Compute Route Matrix.

Asked the way the work tracker modal asks for one trip (/api/distance): driving, no live traffic
(TRAFFIC_UNAWARE, so the same pair gets the same answer whenever it is asked, on the cheapest
tier) and avoiding toll roads. Many pairs are asked at once: blocks of up to MAX_ORIGINS origins
× MAX_DESTINATIONS destinations (625 pairs, Google's cap), several blocks in parallel. Only the
pairs wanted are kept; a block may cover a few more, which Google still bills.

A pair Google has no route for comes back as not found; a block that fails (network, quota,
timeout) is simply missing from the answer, and the caller falls back to an estimate.
"""

from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import httpx

from python_api.auto_work_trackers.travel import Point

MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
FIELD_MASK = "originIndex,destinationIndex,status,condition,distanceMeters,duration"
MAX_ORIGINS = 25
MAX_DESTINATIONS = 25  # 25 × 25 = 625 pairs per request
PARALLEL_REQUESTS = 8
REQUEST_TIMEOUT_S = 8.0

Pair = tuple[Point, Point]


@dataclass(frozen=True)
class RoadLeg:
    found: bool
    meters: int | None = None
    seconds: int | None = None


def _waypoint(p: Point) -> dict[str, Any]:
    return {"waypoint": {"location": {"latLng": {"latitude": p[0], "longitude": p[1]}}}}


def matrix_body(origins: list[Point], destinations: list[Point]) -> dict[str, Any]:
    """The request for one block: driving, no live traffic, no tolls."""
    return {
        "origins": [{**_waypoint(o), "routeModifiers": {"avoidTolls": True}} for o in origins],
        "destinations": [_waypoint(d) for d in destinations],
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_UNAWARE",
    }


def parse_matrix(elements: list[dict[str, Any]], origins: list[Point], destinations: list[Point]) -> dict[Pair, RoadLeg]:
    """One block's answer, by (origin, destination). Elements with an error status are left out."""
    legs: dict[Pair, RoadLeg] = {}
    for e in elements:
        if e.get("status", {}).get("code", 0) != 0:
            continue
        pair = (origins[e.get("originIndex", 0)], destinations[e.get("destinationIndex", 0)])
        if e.get("condition") != "ROUTE_EXISTS":
            legs[pair] = RoadLeg(found=False)
            continue
        duration = e.get("duration", "0s")
        legs[pair] = RoadLeg(
            found=True,
            meters=int(e.get("distanceMeters", 0)),
            seconds=int(float(duration.rstrip("s") or 0)),
        )
    return legs


def blocks(pairs: Iterable[Pair]) -> list[tuple[list[Point], list[Point]]]:
    """Origin × destination blocks covering every pair, each within Google's 625-pair cap. Origins
    are grouped by the destinations they need, so a block asks for few pairs nobody wanted."""
    by_origin: dict[Point, set[Point]] = {}
    for o, d in pairs:
        by_origin.setdefault(o, set()).add(d)
    # Origins needing the same destinations sit together.
    origins = sorted(by_origin, key=lambda o: (sorted(by_origin[o]), o))
    out: list[tuple[list[Point], list[Point]]] = []
    for i in range(0, len(origins), MAX_ORIGINS):
        group = origins[i : i + MAX_ORIGINS]
        wanted = sorted(set().union(*(by_origin[o] for o in group)))
        for j in range(0, len(wanted), MAX_DESTINATIONS):
            out.append((group, wanted[j : j + MAX_DESTINATIONS]))
    return out


def fetch_road_legs(
    pairs: set[Pair],
    api_key: str,
    client: httpx.Client | None = None,
    parallel: int = PARALLEL_REQUESTS,
) -> dict[Pair, RoadLeg]:
    """Road legs for the given pairs, as far as Google answers. Pairs from a failed block are missing."""
    if not pairs:
        return {}
    http = client or httpx.Client(timeout=REQUEST_TIMEOUT_S)
    headers = {"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": FIELD_MASK, "Content-Type": "application/json"}

    def one(block: tuple[list[Point], list[Point]]) -> dict[Pair, RoadLeg]:
        origins, destinations = block
        try:
            response = http.post(MATRIX_URL, json=matrix_body(origins, destinations), headers=headers)
            if not response.is_success:
                return {}
            return parse_matrix(response.json(), origins, destinations)
        except (httpx.HTTPError, ValueError):
            return {}

    found: dict[Pair, RoadLeg] = {}
    with ThreadPoolExecutor(max_workers=max(1, parallel)) as pool:
        for legs in pool.map(one, blocks(pairs)):
            found.update(legs)
    return {pair: leg for pair, leg in found.items() if pair in pairs}
