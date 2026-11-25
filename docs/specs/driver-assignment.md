# Driver assignment (Auto Work Trackers, step one)

Status: written with the code, from Josh's answers in chat. Python only; no UI, no schema change.

## Rule

Given the trips a zone needs in a week (`discover_trips`), choose a **driver and a day** for each.

- **Constraint:** a driver does at most one trip per day. Not an objective.
- **Window:** a trip can happen on any day the bleacher is not at an event: from the day after the
  prior event's end to the day before the next event's start, and only inside the selected week.
  Back-to-back events leave an empty window: the trip is reported as unassignable.
- **Drivers:** active drivers assigned to the zone (`DriverZones`), minus days they marked
  unavailable (`DriverUnavailability`), minus days they already have an active work tracker
  (any status except cancelled, declined, abandoned).
- **Objective:** assign as many trips as possible; among those, give each trip the driver whose
  home address is nearest its pickup (the total straight-line distance is as small as possible).
  A driver with no home address, or a pickup with no coordinates, counts as farther than any real
  distance. Ties go to the earlier day, then the lower driver id. Trips that cannot be placed are
  returned with a reason.
- A trip is one driver for one day, whatever the distance.

## Why no solver yet

With only this constraint and a distance cost the problem is min-cost bipartite matching (trips to
driver-days), which successive cheapest augmenting paths solve optimally. OR-Tools CP-SAT is the choice once rules like the
12-hour day, distance or driver preferences arrive. `assign_trips` is the one function to replace.

## Code

- `discovery.py`: `NeededTrip` gains `earliest_day` / `latest_day` (the strict window above).
  `available_from` / `must_arrive_by` keep their old meaning (used by generate and suggest).
- `assignment.py` (pure): `assign_trips(trips, driver_ids, blocked, week_start, distance) -> AssignmentResult` (`distance(driver, trip)` in metres or None; each `Assignment` carries `distance_m`).
  Unassigned reasons: `no_window`, `outside_week`, `no_free_driver_day`.
- `geo.py`: straight-line `distance_m`. `models.py`: `Driver(driver_uuid, home_address_uuid)`.
- `repository.py`: `load_zone_drivers(zone_id)` (with each driver's home address), `load_address_points(ids)`, `load_blocked_days(driver_ids, week_start, tz)`.
- `service.py`: `plan_assignments(...)`. Creates nothing.
- `POST /api/py/auto-work-trackers/plan` -> assignments + unassigned.
- `accept` takes an optional `driver_uuid` per trip, so an accepted plan item is created with its driver.

## Edge cases

No drivers in the zone: every trip is unassigned (`no_free_driver_day`). A driver blocked by a work
tracker in another zone is still blocked. Two trips for the same bleacher are independent.
