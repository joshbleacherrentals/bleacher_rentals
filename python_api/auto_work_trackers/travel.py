"""Estimated driving between two points, until real routes (Google) are fetched for the chosen legs.

Roads are longer than a straight line: the distance is the straight line times ROAD_FACTOR, driven at
AVERAGE_SPEED_KMH. A point with no coordinates gives no estimate (None); the planner then assumes
UNKNOWN_MINUTES for the clock and charges UNKNOWN_COST_M so it avoids such legs where it can.

Pure: no database, no network.
"""

from dataclasses import dataclass

from python_api.auto_work_trackers.geo import distance_m

Point = tuple[float, float]  # (latitude, longitude)

ROAD_FACTOR = 1.3
AVERAGE_SPEED_KMH = 80
UNKNOWN_MINUTES = 120
UNKNOWN_COST_M = 2_000_000  # 2,000 km: worse than any real leg in a zone


@dataclass(frozen=True)
class Leg:
    """One estimated drive. `meters`/`minutes` are None when either end has no coordinates."""

    meters: int | None
    minutes: int | None

    @property
    def clock_minutes(self) -> int:
        """Minutes to count on the driver's day: the estimate, or UNKNOWN_MINUTES."""
        return self.minutes if self.minutes is not None else UNKNOWN_MINUTES

    @property
    def cost_m(self) -> int:
        """What the planner minimises: metres, or UNKNOWN_COST_M."""
        return self.meters if self.meters is not None else UNKNOWN_COST_M


NO_DRIVE = Leg(0, 0)


def estimate(a: Point | None, b: Point | None) -> Leg:
    if a is None or b is None:
        return Leg(None, None)
    meters = round(distance_m(a, b) * ROAD_FACTOR)
    minutes = round(meters / 1000 / AVERAGE_SPEED_KMH * 60)
    return Leg(meters, minutes)
