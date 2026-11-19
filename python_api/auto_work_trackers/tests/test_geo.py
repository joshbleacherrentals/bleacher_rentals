from python_api.auto_work_trackers.geo import distance_m


def test_calgary_to_edmonton_is_about_280_km():
    assert 270_000 < distance_m((51.0447, -114.0719), (53.5461, -113.4938)) < 295_000


def test_the_same_point_is_zero_metres_apart():
    assert distance_m((51.0, -114.0), (51.0, -114.0)) == 0
