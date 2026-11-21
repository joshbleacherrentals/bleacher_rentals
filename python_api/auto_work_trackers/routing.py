"""Plans the week as driver routes: each driver-day is a route from home and back, carrying one
bleacher at a time, so a day can be home -> pick A -> drop A -> pick B -> drop B -> home.

Rules (constraints):
- A trip happens on one of its allowed days (the bleacher is free), on a day the driver can work.
- One bleacher at a time: a trip's pickup is followed by its own drop-off.
- A driver's day, leaving home to getting back (deadhead included), is at most MAX_DAY_MINUTES.

Objective: place as many trips as possible (a trip left out costs far more than any route), then
drive as few (estimated) metres as possible. Haul length is fixed by the trips, so in effect the
deadhead is what gets smaller: trips are chained when the next pickup is near the last drop-off.

Solved with the OR-Tools routing solver: every free driver-day is a vehicle starting and ending at
the driver's home; each trip is a pickup and a delivery on the same vehicle; a load dimension of
capacity 1 keeps one bleacher on the truck; a time dimension caps the day. Distances and times are
estimates (travel.estimate). The search runs for at most `search_seconds`.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from python_api.auto_work_trackers.assignment import (
    NO_FREE_DRIVER_DAY,
    TOO_LONG_FOR_A_DAY,
    Assignment,
    AssignmentResult,
    Unassigned,
    allowed_days,
)
from python_api.auto_work_trackers.models import NeededTrip
from python_api.auto_work_trackers.travel import NO_DRIVE, Leg, Point, estimate

MAX_DAY_MINUTES = 12 * 60
DAY_START = time(7, 0)  # suggested times count from here, in the zone's local time
SEARCH_SECONDS = 3.0  # stays well inside the request time limit
DROP_PENALTY = 1_000_000_000  # leaving a trip out; far above any route's cost


@dataclass(frozen=True)
class RouteDriver:
    driver_uuid: str
    home: Point | None  # None when the driver has no home coordinates


PointOf = Callable[[str | None], Point | None]
"""(latitude, longitude) of an address id, or None when it has no coordinates."""


def _local(day: str, minutes: int, tz: str) -> str:
    start = datetime.combine(datetime.fromisoformat(day).date(), DAY_START, ZoneInfo(tz))
    return (start + timedelta(minutes=minutes)).isoformat()


def plan_routes(
    trips: list[NeededTrip],
    drivers: Iterable[RouteDriver],
    blocked: set[tuple[str, str]],
    week_start: str,
    point_of: PointOf,
    tz: str = "UTC",
    search_seconds: float = SEARCH_SECONDS,
) -> AssignmentResult:
    """Place the trips on driver-days (see the module doc). `blocked` holds (driver, day) pairs the
    driver cannot work. `search_seconds` <= 0 keeps the first solution found (no improvement)."""
    drivers = sorted(drivers, key=lambda d: d.driver_uuid)
    days_of: dict[int, list[str]] = {}
    reasons: dict[int, str] = {}
    for k, trip in enumerate(trips):
        days, why = allowed_days(trip, week_start)
        if why:
            reasons[k] = why
        else:
            days_of[k] = days

    # Every free driver-day some trip could use is a vehicle.
    wanted_days = sorted({d for days in days_of.values() for d in days})
    vehicles = [(drv, day) for drv in drivers for day in wanted_days if (drv.driver_uuid, day) not in blocked]

    pickup = {k: point_of(trips[k].from_address_uuid) for k in days_of}
    dropoff = {k: point_of(trips[k].to_address_uuid) for k in days_of}
    haul = {k: estimate(pickup[k], dropoff[k]) for k in days_of}

    # The vehicles each trip may use: one of its days, and the trip fits a day on its own.
    allowed: dict[int, list[int]] = {}
    for k, days in days_of.items():
        on_days = [v for v, (_, day) in enumerate(vehicles) if day in days]
        fits = [
            v
            for v in on_days
            if estimate(vehicles[v][0].home, pickup[k]).clock_minutes
            + haul[k].clock_minutes
            + estimate(dropoff[k], vehicles[v][0].home).clock_minutes
            <= MAX_DAY_MINUTES
        ]
        if not on_days:
            reasons[k] = NO_FREE_DRIVER_DAY
        elif not fits:
            reasons[k] = TOO_LONG_FOR_A_DAY
        else:
            allowed[k] = fits

    placeable = sorted(allowed)
    if not placeable:
        return AssignmentResult(unassigned=[Unassigned(trips[k], reasons[k]) for k in sorted(reasons)])

    # Nodes: a start and an end (both home) per vehicle, then a pickup and a delivery per trip.
    n_vehicles = len(vehicles)
    node_point: list[Point | None] = []
    for drv, _ in vehicles:
        node_point += [drv.home, drv.home]
    trip_of_node: dict[int, int] = {}
    pickup_node: dict[int, int] = {}
    delivery_node: dict[int, int] = {}
    for k in placeable:
        pickup_node[k], delivery_node[k] = len(node_point), len(node_point) + 1
        trip_of_node[pickup_node[k]] = trip_of_node[delivery_node[k]] = k
        node_point += [pickup[k], dropoff[k]]

    n_nodes = len(node_point)
    is_depot = [i < 2 * n_vehicles for i in range(n_nodes)]

    def leg(i: int, j: int) -> Leg:
        if i == j or (is_depot[i] and is_depot[j]):
            return NO_DRIVE
        k = trip_of_node.get(i)
        if k is not None and i == pickup_node[k] and j == delivery_node[k]:
            return haul[k]
        return estimate(node_point[i], node_point[j])

    legs = [[leg(i, j) for j in range(n_nodes)] for i in range(n_nodes)]
    minutes = [[legs[i][j].clock_minutes for j in range(n_nodes)] for i in range(n_nodes)]
    cost = [[legs[i][j].cost_m for j in range(n_nodes)] for i in range(n_nodes)]

    starts = [2 * v for v in range(n_vehicles)]
    ends = [2 * v + 1 for v in range(n_vehicles)]
    manager = pywrapcp.RoutingIndexManager(n_nodes, n_vehicles, starts, ends)
    routing = pywrapcp.RoutingModel(manager)

    cost_cb = routing.RegisterTransitCallback(
        lambda a, b: cost[manager.IndexToNode(a)][manager.IndexToNode(b)]
    )
    routing.SetArcCostEvaluatorOfAllVehicles(cost_cb)

    time_cb = routing.RegisterTransitCallback(
        lambda a, b: minutes[manager.IndexToNode(a)][manager.IndexToNode(b)]
    )
    routing.AddDimension(time_cb, 0, MAX_DAY_MINUTES, True, "Time")
    clock = routing.GetDimensionOrDie("Time")

    def demand(index: int) -> int:
        node = manager.IndexToNode(index)
        k = trip_of_node.get(node)
        if k is None:
            return 0
        return 1 if node == pickup_node[k] else -1

    load_cb = routing.RegisterUnaryTransitCallback(demand)
    routing.AddDimensionWithVehicleCapacity(load_cb, 0, [1] * n_vehicles, True, "Load")

    solver = routing.solver()
    for k in placeable:
        p, d = manager.NodeToIndex(pickup_node[k]), manager.NodeToIndex(delivery_node[k])
        routing.AddPickupAndDelivery(p, d)
        solver.Add(routing.VehicleVar(p) == routing.VehicleVar(d))
        solver.Add(clock.CumulVar(p) <= clock.CumulVar(d))
        # Only the allowed vehicles; -1 is "not visited", for when the trip is left out.
        routing.VehicleVar(p).SetValues([-1, *allowed[k]])
        routing.VehicleVar(d).SetValues([-1, *allowed[k]])
        routing.AddDisjunction([p, d], DROP_PENALTY, 2)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    if search_seconds > 0:
        params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        params.time_limit.FromMilliseconds(int(search_seconds * 1000))
    solution = routing.SolveWithParameters(params)

    placed: dict[int, tuple[int, int, int | None, int, int]] = {}  # trip -> (vehicle, seq, prev trip, at p, at d)
    route_last: dict[int, int] = {}
    if solution:
        for v in range(n_vehicles):
            index, seq, prev = routing.Start(v), 0, None
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                k = trip_of_node.get(node)
                if k is not None and node == pickup_node[k]:
                    seq += 1
                    d_index = manager.NodeToIndex(delivery_node[k])
                    placed[k] = (
                        v,
                        seq,
                        prev,
                        solution.Value(clock.CumulVar(index)),
                        solution.Value(clock.CumulVar(d_index)),
                    )
                    prev = k
                index = solution.Value(routing.NextVar(index))
            if prev is not None:
                route_last[v] = prev

    order = sorted(placed, key=lambda k: (vehicles[placed[k][0]][0].driver_uuid, vehicles[placed[k][0]][1], placed[k][1]))
    position = {k: i for i, k in enumerate(order)}
    assigned: list[Assignment] = []
    for k in order:
        v, seq, prev, at_pickup, at_dropoff = placed[k]
        drv, day = vehicles[v]
        came_from = dropoff[prev] if prev is not None else drv.home
        assigned.append(
            Assignment(
                trip=trips[k],
                driver_uuid=drv.driver_uuid,
                date=day,
                sequence=seq,
                previous_index=position[prev] if prev is not None else None,
                planned_pickup_at=_local(day, at_pickup, tz),
                planned_dropoff_at=_local(day, at_dropoff, tz),
                deadhead_in=estimate(came_from, pickup[k]),
                haul=haul[k],
                return_home=estimate(dropoff[k], drv.home) if route_last.get(v) == k else None,
            )
        )

    for k in placeable:
        if k not in placed:
            reasons[k] = NO_FREE_DRIVER_DAY
    return AssignmentResult(
        assigned=assigned,
        unassigned=[Unassigned(trips[k], reasons[k]) for k in sorted(reasons)],
    )
