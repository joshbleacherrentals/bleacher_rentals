from datetime import datetime, timezone

from python_api.auto_work_trackers.google_routes import RoadLeg
from python_api.auto_work_trackers.road_times import load_road_times, pair_key, rounded
from python_api.auto_work_trackers.travel import estimate

NOW = datetime(2026, 11, 22, tzinfo=timezone.utc)
A, B, C = (43.100001, -79.2), (43.2, -79.3), (43.3, -79.4)


class FakeCache:
    def __init__(self, legs=None):
        self.legs = legs or {}
        self.saved = None
        self.asked_since = None

    def load_route_cache(self, keys, since):
        self.asked_since = since
        return {k: v for k, v in self.legs.items() if k in keys}

    def save_route_cache(self, rows):
        self.saved = rows


def test_cached_pairs_are_not_asked_again_and_new_ones_are_saved():
    cache = FakeCache({pair_key(rounded(A), B): RoadLeg(True, 9000, 600)})
    asked = []

    def fetch(pairs):
        asked.append(pairs)
        return {p: RoadLeg(True, 20000, 1200) for p in pairs}

    travel, stats = load_road_times([(A, B), (B, C)], cache, fetch, NOW)
    assert asked == [{(B, C)}]
    assert travel(A, B).meters == 9000 and travel(A, B).minutes == 10
    assert travel(B, C).meters == 20000 and travel(B, C).minutes == 20
    assert [r["pair_key"] for r in cache.saved] == [pair_key(B, C)]
    assert (stats.google, stats.cached, stats.estimated) == (1, 1, 0)
    assert cache.asked_since.startswith("2026-10-23")


def test_unanswered_or_not_found_pairs_fall_back_to_the_estimate():
    def fetch(pairs):
        return {(B, C): RoadLeg(False)}

    travel, stats = load_road_times([(A, B), (B, C)], None, fetch, NOW)
    assert travel(A, B) == estimate(A, B)
    assert travel(B, C) == estimate(B, C)
    assert stats.estimated == 2


def test_no_key_means_estimates_and_same_place_means_no_drive():
    travel, stats = load_road_times([(A, B), (A, A)], None, None, NOW)
    assert travel(A, B) == estimate(A, B)
    assert travel(A, A).meters == 0
    assert travel(None, B).meters is None
    assert (stats.google, stats.estimated) == (0, 1)


def test_a_broken_cache_does_not_stop_the_run():
    class Broken(FakeCache):
        def load_route_cache(self, keys, since):
            raise RuntimeError("down")

    travel, _ = load_road_times([(A, B)], Broken(), lambda p: {x: RoadLeg(True, 5000, 300) for x in p}, NOW)
    assert travel(A, B).meters == 5000
