"""Straight-line distance between two points on the map."""

from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_M = 6_371_000


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> int:
    """Metres between two (latitude, longitude) points, as the crow flies (haversine)."""
    lat1, lon1, lat2, lon2 = map(radians, (a[0], a[1], b[0], b[1]))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return round(2 * EARTH_RADIUS_M * asin(sqrt(h)))
