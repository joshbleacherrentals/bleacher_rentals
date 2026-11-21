from python_api.auto_work_trackers.travel import UNKNOWN_COST_M, UNKNOWN_MINUTES, estimate

CALGARY = (51.05, -114.07)
EDMONTON = (53.55, -113.49)


def test_estimate_is_the_straight_line_times_the_road_factor_at_the_average_speed():
    leg = estimate(CALGARY, EDMONTON)
    assert 360_000 < leg.meters < 380_000  # ~280 km straight, ~1.3x by road
    assert 270 < leg.minutes < 290  # ~370 km at 80 km/h
    assert leg.clock_minutes == leg.minutes and leg.cost_m == leg.meters


def test_the_same_point_is_no_drive():
    assert estimate(CALGARY, CALGARY).meters == 0


def test_a_missing_point_gives_no_estimate_but_a_cautious_clock_and_a_high_cost():
    leg = estimate(None, EDMONTON)
    assert leg.meters is None and leg.minutes is None
    assert leg.clock_minutes == UNKNOWN_MINUTES and leg.cost_m == UNKNOWN_COST_M
