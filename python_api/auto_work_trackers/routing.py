"""The Auto Work Trackers solver: places trips on driver-days as routes. Pure: no database, no
network, no business rules. The TypeScript planner prepares everything (which trips, which
driver-days may take each one, the drive time and cost between every pair of places) and turns the
answer into work trackers.

Rules (constraints):
- A trip goes on one of the vehicles it allows (its days, a driver free that day).
- One bleacher at a time: a trip's pickup is followed by its own drop-off.
- A vehicle's day, leaving home to getting back, is at most `max_day_minutes`. Time on site at a
  pickup or drop-off (`pickup_minutes` / `dropoff_minutes`) counts towards it.

Objective: place as many trips as possible (a trip left out costs far more than any route), then
the least total cost. Haul cost is fixed by the trips, so in effect the deadhead gets smaller:
trips are chained when the next pickup is near the last drop-off.

OR-Tools routing: every vehicle starts and ends at its home; each trip is a pickup and a delivery
on the same vehicle; a load dimension of capacity 1; a time dimension capped at the day limit. The
search runs for at most `search_seconds` (0: keep the first solution).
"""

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from python_api.auto_work_trackers.schemas import (
    SolveRequest,
    SolveResponse,
    SolveRoute,
    SolveStop,
    SolveUnplaced,
)

DROP_PENALTY = 1_000_000_000  # leaving a trip out; far above any route's cost

NO_VEHICLE = "no_vehicle"  # no vehicle it may use
TOO_LONG_FOR_A_DAY = "too_long_for_a_day"  # even alone, home -> pickup -> drop-off -> home is over the limit
NO_ROOM = "no_room"  # the allowed vehicles had no room left for it


class InvalidSolveRequest(ValueError):
    pass


def _check(req: SolveRequest) -> None:
    n = len(req.minutes)
    if len(req.costs) != n or any(len(row) != n for row in req.minutes + req.costs):
        raise InvalidSolveRequest("minutes and costs must be square matrices of the same size.")
    places = [v.home for v in req.vehicles] + [p for t in req.trips for p in (t.pickup, t.dropoff)]
    if any(not 0 <= p < n for p in places):
        raise InvalidSolveRequest("a place index is outside the matrices.")
    ids = {v.id for v in req.vehicles}
    if len(ids) != len(req.vehicles):
        raise InvalidSolveRequest("vehicle ids must be unique.")


def solve(req: SolveRequest) -> SolveResponse:
    _check(req)
    minutes, costs, limit = req.minutes, req.costs, req.max_day_minutes
    vehicle_index = {v.id: i for i, v in enumerate(req.vehicles)}
    unplaced: list[SolveUnplaced] = []

    # The vehicles each trip may use, and fits on alone within the day.
    allowed: dict[int, list[int]] = {}
    for k, trip in enumerate(req.trips):
        on = [vehicle_index[v] for v in trip.vehicles if v in vehicle_index]
        fits = [
            v
            for v in on
            if minutes[req.vehicles[v].home][trip.pickup]
            + trip.pickup_minutes
            + minutes[trip.pickup][trip.dropoff]
            + trip.dropoff_minutes
            + minutes[trip.dropoff][req.vehicles[v].home]
            <= limit
        ]
        if not on:
            unplaced.append(SolveUnplaced(trip=trip.id, reason=NO_VEHICLE))
        elif not fits:
            unplaced.append(SolveUnplaced(trip=trip.id, reason=TOO_LONG_FOR_A_DAY))
        else:
            allowed[k] = fits
    if not allowed:
        return SolveResponse(routes=[], unplaced=unplaced)

    # Nodes: a start and an end (both home) per vehicle, then a pickup and a delivery per trip.
    n_vehicles = len(req.vehicles)
    place_of: list[int] = []
    for v in req.vehicles:
        place_of += [v.home, v.home]
    trip_of_node: dict[int, int] = {}
    on_site: dict[int, int] = {}  # node -> minutes spent there before driving on
    pickup_node: dict[int, int] = {}
    delivery_node: dict[int, int] = {}
    for k in sorted(allowed):
        pickup_node[k], delivery_node[k] = len(place_of), len(place_of) + 1
        trip_of_node[pickup_node[k]] = trip_of_node[delivery_node[k]] = k
        on_site[pickup_node[k]] = req.trips[k].pickup_minutes
        on_site[delivery_node[k]] = req.trips[k].dropoff_minutes
        place_of += [req.trips[k].pickup, req.trips[k].dropoff]
    n_nodes = len(place_of)
    depot = 2 * n_vehicles

    def between(matrix: list[list[int]], i: int, j: int) -> int:
        if i < depot and j < depot:  # an unused vehicle: home to home
            return 0
        return matrix[place_of[i]][place_of[j]]

    manager = pywrapcp.RoutingIndexManager(
        n_nodes, n_vehicles, [2 * v for v in range(n_vehicles)], [2 * v + 1 for v in range(n_vehicles)]
    )
    routing = pywrapcp.RoutingModel(manager)
    cost_cb = routing.RegisterTransitCallback(
        lambda a, b: between(costs, manager.IndexToNode(a), manager.IndexToNode(b))
    )
    routing.SetArcCostEvaluatorOfAllVehicles(cost_cb)
    # Time from a node to the next: the time on site there, then the drive.
    time_cb = routing.RegisterTransitCallback(
        lambda a, b: on_site.get(manager.IndexToNode(a), 0)
        + between(minutes, manager.IndexToNode(a), manager.IndexToNode(b))
    )
    routing.AddDimension(time_cb, 0, limit, True, "Time")
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
    for k in allowed:
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
    if req.search_seconds > 0:
        params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        params.time_limit.FromMilliseconds(int(req.search_seconds * 1000))
    solution = routing.SolveWithParameters(params)

    routes: list[SolveRoute] = []
    placed: set[int] = set()
    if solution:
        for v, vehicle in enumerate(req.vehicles):
            stops: list[SolveStop] = []
            index = routing.Start(v)
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                k = trip_of_node.get(node)
                if k is not None and node == pickup_node[k]:
                    d_index = manager.NodeToIndex(delivery_node[k])
                    stops.append(
                        SolveStop(
                            trip=req.trips[k].id,
                            pickup_minute=solution.Value(clock.CumulVar(index)),
                            dropoff_minute=solution.Value(clock.CumulVar(d_index)),
                        )
                    )
                    placed.add(k)
                index = solution.Value(routing.NextVar(index))
            if stops:
                routes.append(SolveRoute(vehicle=vehicle.id, stops=stops))

    unplaced += [SolveUnplaced(trip=req.trips[k].id, reason=NO_ROOM) for k in sorted(allowed) if k not in placed]
    return SolveResponse(routes=routes, unplaced=unplaced)
