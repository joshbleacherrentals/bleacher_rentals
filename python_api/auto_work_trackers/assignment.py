"""Chooses a driver and a day for each needed trip.

Rule: a driver does at most one trip a day (a constraint, not an objective). A trip can happen on any
day its bleacher is not at an event (`earliest_day`..`latest_day`), inside the selected week, on a day
the driver is free.

Objective: place as many trips as possible, and among those placements choose the drivers whose home
is closest to each trip's pickup (the total distance is as small as it can be). A driver or pickup
with no known location counts as farther than any real distance. Ties go to the earlier day, then the
lower driver id, so the answer is the same every run.

That is min-cost bipartite matching (trips to driver-days), solved exactly below by repeatedly taking
the cheapest augmenting path. When more rules arrive (daily hours, preferences), replace
`assign_trips` with a CP-SAT model; its inputs and outputs can stay the same.

Pure: no database, no clock.
"""

from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta

from python_api.auto_work_trackers.dates import week_end_of
from python_api.auto_work_trackers.models import NeededTrip

NO_WINDOW = "no_window"  # the bleacher is never free between the events (they are back to back)
OUTSIDE_WEEK = "outside_week"  # its free days all fall outside the selected week
NO_FREE_DRIVER_DAY = "no_free_driver_day"  # every driver-day in the window is taken or unavailable

# A distance nobody can reach on Earth, standing in for "unknown": worse than every real distance.
UNKNOWN_DISTANCE_M = 20_000_000

# Cost = distance first, then earlier day, then lower driver id.
_DISTANCE_WEIGHT = 1_000_000
_DAY_WEIGHT = 10_000

DistanceFn = Callable[[str, NeededTrip], int | None]
"""Metres from a driver (by id) to a trip's pickup, or None when either place has no known location."""


@dataclass(frozen=True)
class Assignment:
    trip: NeededTrip
    driver_uuid: str
    date: str
    distance_m: int | None = None  # driver's home to the pickup; None when unknown


@dataclass(frozen=True)
class Unassigned:
    trip: NeededTrip
    reason: str


@dataclass(frozen=True)
class AssignmentResult:
    assigned: list[Assignment] = field(default_factory=list)
    unassigned: list[Unassigned] = field(default_factory=list)


def _days(first: str, last: str) -> list[str]:
    start, end = date.fromisoformat(first), date.fromisoformat(last)
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def allowed_days(trip: NeededTrip, week_start: str) -> tuple[list[str], str | None]:
    """The days the trip may happen, or (empty, why not)."""
    first = trip.earliest_day if trip.earliest_day is not None else trip.available_from
    last = trip.latest_day if trip.latest_day is not None else trip.must_arrive_by
    if first > last:
        return [], NO_WINDOW
    first, last = max(first, week_start), min(last, week_end_of(week_start))
    if first > last:
        return [], OUTSIDE_WEEK
    return _days(first, last), None


class _Flow:
    """Min-cost flow on a small graph, one unit at a time along the cheapest path (SPFA)."""

    def __init__(self, nodes: int):
        self.graph: list[list[int]] = [[] for _ in range(nodes)]
        self.to: list[int] = []
        self.cap: list[int] = []
        self.cost: list[int] = []

    def add_edge(self, a: int, b: int, cost: int) -> int:
        self.graph[a].append(len(self.to))
        self.to.append(b)
        self.cap.append(1)
        self.cost.append(cost)
        self.graph[b].append(len(self.to))
        self.to.append(a)
        self.cap.append(0)
        self.cost.append(-cost)
        return len(self.to) - 2

    def augment(self, source: int, sink: int) -> bool:
        inf = float("inf")
        dist = [inf] * len(self.graph)
        previous_edge = [-1] * len(self.graph)
        queued = [False] * len(self.graph)
        dist[source] = 0
        queue = deque([source])
        while queue:
            node = queue.popleft()
            queued[node] = False
            for edge in self.graph[node]:
                target = self.to[edge]
                if self.cap[edge] > 0 and dist[node] + self.cost[edge] < dist[target]:
                    dist[target] = dist[node] + self.cost[edge]
                    previous_edge[target] = edge
                    if not queued[target]:
                        queued[target] = True
                        queue.append(target)
        if dist[sink] == inf:
            return False
        node = sink
        while node != source:
            edge = previous_edge[node]
            self.cap[edge] -= 1
            self.cap[edge ^ 1] += 1
            node = self.to[edge ^ 1]
        return True


def assign_trips(
    trips: list[NeededTrip],
    driver_ids: Iterable[str],
    blocked: set[tuple[str, str]],
    week_start: str,
    distance: DistanceFn | None = None,
) -> AssignmentResult:
    """Place as many trips as possible, one per driver per day, preferring the nearest drivers.

    `blocked` holds (driver, day) pairs that are not free: unavailable, or already working that day.
    `distance` gives metres from a driver's home to a trip's pickup (None = unknown); without it every
    driver is equally near and the earliest day and lowest driver id win.
    """
    drivers = sorted(set(driver_ids))
    driver_rank = {driver: i for i, driver in enumerate(drivers)}

    reasons: dict[int, str] = {}
    edges: list[tuple[int, tuple[str, str], int, int | None]] = []  # trip, slot, cost, metres
    slots: dict[tuple[str, str], int] = {}
    for index, trip in enumerate(trips):
        days, why = allowed_days(trip, week_start)
        if why:
            reasons[index] = why
            continue
        metres_for: dict[str, int | None] = {}
        for day_rank, day in enumerate(days):
            for driver in drivers:
                if (driver, day) in blocked:
                    continue
                if driver not in metres_for:
                    metres_for[driver] = distance(driver, trip) if distance else None
                metres = metres_for[driver]
                effective = UNKNOWN_DISTANCE_M if metres is None else metres
                cost = effective * _DISTANCE_WEIGHT + day_rank * _DAY_WEIGHT + driver_rank[driver]
                slot = (driver, day)
                slots.setdefault(slot, len(slots))
                edges.append((index, slot, cost, metres))

    # Nodes: source, one per trip, one per slot, sink.
    source, sink = 0, 1
    trip_node = lambda i: 2 + i  # noqa: E731
    slot_node = lambda s: 2 + len(trips) + s  # noqa: E731
    flow = _Flow(2 + len(trips) + len(slots))
    for index in range(len(trips)):
        if index not in reasons:
            flow.add_edge(source, trip_node(index), 0)
    for slot, number in slots.items():
        flow.add_edge(slot_node(number), sink, 0)
    edge_ids = [
        (flow.add_edge(trip_node(i), slot_node(slots[slot]), cost), i, slot, metres)
        for i, slot, cost, metres in edges
    ]
    while flow.augment(source, sink):
        pass

    chosen: dict[int, tuple[tuple[str, str], int | None]] = {}
    for edge_id, index, slot, metres in edge_ids:
        if flow.cap[edge_id] == 0:  # this edge carries flow
            chosen[index] = (slot, metres)

    result = AssignmentResult()
    for index, trip in enumerate(trips):
        if index in chosen:
            (driver, day), metres = chosen[index]
            result.assigned.append(Assignment(trip, driver, day, metres))
        else:
            result.unassigned.append(Unassigned(trip, reasons.get(index, NO_FREE_DRIVER_DAY)))
    return result
