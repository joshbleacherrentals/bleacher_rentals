"""Road distances and drive times for the planner: Google's where it has them, else the estimate.

For a planning run, every pair of points the solver may drive between is looked up once: first in
the RouteCache table (answers from the last CACHE_DAYS days), then the rest from Google in one batch
(google_routes), which are saved back to the cache. Points are rounded to 5 decimals (about a
metre), so the same place always makes the same pair. A pair with no answer (Google failed or found
no route, or no key is set) uses the straight-line estimate (travel.estimate).
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

from python_api.auto_work_trackers.google_routes import Pair, RoadLeg
from python_api.auto_work_trackers.travel import NO_DRIVE, Leg, Point, estimate

CACHE_DAYS = 30

FetchLegs = Callable[[set[Pair]], dict[Pair, RoadLeg]]


def rounded(p: Point) -> Point:
    return (round(p[0], 5), round(p[1], 5))


def pair_key(a: Point, b: Point) -> str:
    """The cache key: both points to 5 decimals. No commas, so it can sit in a REST `in` list."""
    return f"{a[0]:.5f}_{a[1]:.5f}_{b[0]:.5f}_{b[1]:.5f}"


class RouteCacheStore(Protocol):
    def load_route_cache(self, keys: list[str], since: str) -> dict[str, RoadLeg]: ...
    def save_route_cache(self, rows: list[dict]) -> None: ...


@dataclass(frozen=True)
class TravelStats:
    """Where the run's pairs came from: Google just now, the cache, or the estimate."""

    google: int = 0
    cached: int = 0
    estimated: int = 0


class RoadTimes:
    """A travel function for the planner: (from, to) -> Leg."""

    def __init__(self, legs: dict[Pair, RoadLeg]):
        self._legs = legs

    def __call__(self, a: Point | None, b: Point | None) -> Leg:
        if a is None or b is None:
            return estimate(a, b)
        ra, rb = rounded(a), rounded(b)
        if ra == rb:
            return NO_DRIVE
        leg = self._legs.get((ra, rb))
        if leg and leg.found and leg.meters is not None and leg.seconds is not None:
            return Leg(leg.meters, round(leg.seconds / 60))
        return estimate(a, b)


def load_road_times(
    pairs: Iterable[tuple[Point | None, Point | None]],
    cache: RouteCacheStore | None,
    fetch: FetchLegs | None,
    now: datetime,
) -> tuple[RoadTimes, TravelStats]:
    """Look every pair up (cache, then Google for the rest) and return the planner's travel function."""
    wanted = {(rounded(a), rounded(b)) for a, b in pairs if a and b and rounded(a) != rounded(b)}
    by_key = {pair_key(*p): p for p in wanted}

    legs: dict[Pair, RoadLeg] = {}
    if cache and by_key:
        since = (now - timedelta(days=CACHE_DAYS)).isoformat()
        try:
            for key, leg in cache.load_route_cache(sorted(by_key), since).items():
                if key in by_key:
                    legs[by_key[key]] = leg
        except Exception:  # noqa: BLE001 - a broken cache only costs a fresh lookup
            legs = {}
    cached = len(legs)

    fresh: dict[Pair, RoadLeg] = {}
    missing = wanted - set(legs)
    if fetch and missing:
        fresh = fetch(missing)
        legs.update(fresh)
        if cache and fresh:
            rows = [
                {
                    "pair_key": pair_key(a, b),
                    "from_lat": a[0],
                    "from_lng": a[1],
                    "to_lat": b[0],
                    "to_lng": b[1],
                    "found": leg.found,
                    "distance_meters": leg.meters,
                    "duration_seconds": leg.seconds,
                    "fetched_at": now.isoformat(),
                }
                for (a, b), leg in fresh.items()
            ]
            try:
                cache.save_route_cache(rows)
            except Exception:  # noqa: BLE001 - the run still has its answers
                pass

    answered = sum(1 for leg in legs.values() if leg.found)
    return RoadTimes(legs), TravelStats(
        google=len(fresh), cached=cached, estimated=len(wanted) - answered
    )
