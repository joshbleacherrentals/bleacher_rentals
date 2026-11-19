"""Everything that talks to Supabase for this feature: reads the data, writes the work trackers."""

from typing import Any

from python_api.auto_work_trackers.dates import day_after, day_before, to_local_date, week_end_of
from python_api.auto_work_trackers.models import BleacherInput, Driver, ExistingTrip, NeededTrip, Stop
from python_api.core.supabase import SupabaseRest

# Work trackers that are off: nobody is going to make the trip, so they do not cover it.
OFF_STATUSES = {"cancelled", "declined", "abandoned"}


class WorkTrackerRepository:
    def __init__(self, supabase: SupabaseRest):
        self._db = supabase

    def load_bleachers(self, zone_id: str, tz: str) -> list[BleacherInput]:
        """The zone's bleachers, each with the events it is booked for and the trips it already has."""
        bleachers = self._db.select(
            "Bleachers",
            "id,bleacher_number",
            {"zone_uuid": f"eq.{zone_id}", "deleted": "eq.false", "order": "bleacher_number.asc"},
        )
        ids = [b["id"] for b in bleachers]
        stops = self._stops_by_bleacher(ids, tz)
        trips = self._trips_by_bleacher(ids, tz)
        return [
            BleacherInput(b["id"], b["bleacher_number"], stops.get(b["id"], []), trips.get(b["id"], []))
            for b in bleachers
        ]

    def create_draft_work_trackers(self, trips: list[NeededTrip], dates: list[str]) -> list[str]:
        """One draft work tracker per trip, dated `dates[i]`, with no driver, contact or times.

        Returns the new work trackers' ids.
        """
        rows = [
            {
                "bleacher_uuid": trip.bleacher_uuid,
                "date": day,
                "status": "draft",
                "pickup_address_uuid": trip.from_address_uuid,
                "dropoff_address_uuid": trip.to_address_uuid,
            }
            for trip, day in zip(trips, dates, strict=True)
        ]
        return [row["id"] for row in self._db.insert("WorkTrackers", rows)]

    def load_zone_drivers(self, zone_id: str) -> list[Driver]:
        """The active drivers assigned to the zone, with the address each starts from. Ordered by id."""
        links = self._db.select("DriverZones", "driver_uuid", {"zone_uuid": f"eq.{zone_id}"})
        driver_ids = sorted({link["driver_uuid"] for link in links})
        drivers = self._db.select_in("Drivers", "id,is_active,address_uuid", "id", driver_ids)
        return sorted(
            (Driver(d["id"], d["address_uuid"]) for d in drivers if d["is_active"]),
            key=lambda d: d.driver_uuid,
        )

    def load_address_points(self, address_ids: list[str]) -> dict[str, tuple[float, float]]:
        """(latitude, longitude) of each address that has coordinates. Others are left out."""
        rows = self._db.select_in("Addresses", "id,latitude,longitude", "id", sorted(set(address_ids)))
        return {
            r["id"]: (float(r["latitude"]), float(r["longitude"]))
            for r in rows
            if r.get("latitude") is not None and r.get("longitude") is not None
        }

    def load_blocked_days(self, driver_ids: list[str], week_start: str, tz: str) -> set[tuple[str, str]]:
        """(driver, day) pairs inside the week a driver cannot take a trip.

        A day the driver marked unavailable, or one they already have an active work tracker on.
        """
        # The dates are fetched with a day to spare each side and trimmed to the local days after.
        window = f"(date.gte.{day_before(week_start)},date.lte.{day_after(week_end_of(week_start))})"
        unavailable_window = window.replace("date.", "date_unavailable.")
        week_end = week_end_of(week_start)

        blocked: set[tuple[str, str]] = set()
        for row in self._db.select_in(
            "DriverUnavailability", "driver_uuid,date_unavailable", "driver_uuid", driver_ids, {"and": unavailable_window}
        ):
            day = to_local_date(row["date_unavailable"], tz)
            if day and week_start <= day <= week_end:
                blocked.add((row["driver_uuid"], day))
        for row in self._db.select_in(
            "WorkTrackers", "driver_uuid,date,status", "driver_uuid", driver_ids, {"and": window}
        ):
            day = to_local_date(row["date"], tz)
            if day and week_start <= day <= week_end and row["status"] not in OFF_STATUSES:
                blocked.add((row["driver_uuid"], day))
        return blocked

    def existing_work_tracker_keys(self, trips: list[Any], tz: str) -> set[tuple[str, str, str | None]]:
        """(bleacher, local day, drop-off address) of the active work trackers matching the given trips."""
        bleacher_ids = sorted({t.bleacher_uuid for t in trips})
        rows = self._db.select_in(
            "WorkTrackers", "bleacher_uuid,date,status,dropoff_address_uuid", "bleacher_uuid", bleacher_ids
        )
        return {
            (row["bleacher_uuid"], to_local_date(row["date"], tz) or "", row["dropoff_address_uuid"])
            for row in rows
            if row["status"] not in OFF_STATUSES
        }

    def create_accepted_work_trackers(self, trips: list[Any]) -> list[str]:
        """One draft work tracker per accepted trip, in order. Returns the new work trackers' ids."""
        rows = [
            {
                "bleacher_uuid": t.bleacher_uuid,
                "date": t.date,
                "status": "draft",
                "pickup_address_uuid": t.from_address_uuid,
                "dropoff_address_uuid": t.to_address_uuid,
                **({"driver_uuid": t.driver_uuid} if getattr(t, "driver_uuid", None) else {}),
            }
            for t in trips
        ]
        return [row["id"] for row in self._db.insert("WorkTrackers", rows)]

    def _stops_by_bleacher(self, bleacher_ids: list[str], tz: str) -> dict[str, list[Stop]]:
        links = self._db.select_in("BleacherEvents", "bleacher_uuid,event_uuid", "bleacher_uuid", bleacher_ids)
        event_ids = sorted({link["event_uuid"] for link in links})
        events = {
            e["id"]: e
            for e in self._db.select_in(
                "Events",
                "id,event_name,setup_start,event_start,event_end,teardown_end,address_uuid,venue_uuid",
                "id",
                event_ids,
                {"event_status": "eq.booked", "deleted": "eq.false"},
            )
        }
        venue_ids = sorted({e["venue_uuid"] for e in events.values() if e["venue_uuid"]})
        venue_address = {v["id"]: v["address_uuid"] for v in self._db.select_in("Venues", "id,address_uuid", "id", venue_ids)}
        address_ids = sorted(
            {e["address_uuid"] for e in events.values() if e["address_uuid"]}
            | {a for a in venue_address.values() if a}
        )
        streets = {a["id"]: a["street"] for a in self._db.select_in("Addresses", "id,street", "id", address_ids)}

        def place(event: dict[str, Any]) -> tuple[str | None, str | None]:
            # An event's place is its own address, or its venue's when it has no street of its own.
            own = event["address_uuid"]
            if own and streets.get(own) is not None:
                return own, streets[own]
            venue = venue_address.get(event["venue_uuid"]) if event["venue_uuid"] else None
            return (venue, streets.get(venue)) if venue else (own, None)

        stops: dict[str, list[Stop]] = {}
        for link in links:
            event = events.get(link["event_uuid"])
            if not event:
                continue
            start = to_local_date(event["setup_start"] or event["event_start"], tz)
            end = to_local_date(event["teardown_end"] or event["event_end"], tz)
            if not start or not end:
                continue
            address_uuid, street = place(event)
            stops.setdefault(link["bleacher_uuid"], []).append(
                Stop(event["id"], event["event_name"], address_uuid, street, start, end)
            )
        return stops

    def _trips_by_bleacher(self, bleacher_ids: list[str], tz: str) -> dict[str, list[ExistingTrip]]:
        rows = [
            r
            for r in self._db.select_in(
                "WorkTrackers",
                "bleacher_uuid,date,status,pickup_address_uuid,dropoff_address_uuid",
                "bleacher_uuid",
                bleacher_ids,
            )
            if r["status"] not in OFF_STATUSES
        ]
        address_ids = sorted({a for r in rows for a in (r["pickup_address_uuid"], r["dropoff_address_uuid"]) if a})
        streets = {a["id"]: a["street"] for a in self._db.select_in("Addresses", "id,street", "id", address_ids)}

        trips: dict[str, list[ExistingTrip]] = {}
        for r in rows:
            trips.setdefault(r["bleacher_uuid"], []).append(
                ExistingTrip(
                    to_local_date(r["date"], tz),
                    streets.get(r["pickup_address_uuid"]),
                    streets.get(r["dropoff_address_uuid"]),
                    r["dropoff_address_uuid"],
                )
            )
        return trips
