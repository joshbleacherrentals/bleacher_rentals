import json

import httpx

from python_api.auto_work_trackers.models import NeededTrip
from python_api.auto_work_trackers.repository import WorkTrackerRepository
from python_api.core.supabase import SupabaseRest

TABLES = {
    "Bleachers": [{"id": "b1", "bleacher_number": 1}],
    "BleacherEvents": [
        {"bleacher_uuid": "b1", "event_uuid": "e1"},
        {"bleacher_uuid": "b1", "event_uuid": "e2"},
    ],
    "Events": [
        {"id": "e1", "event_name": "One", "setup_start": None, "event_start": "2026-11-02T18:00:00+00:00",
         "event_end": "2026-11-05T03:00:00+00:00", "teardown_end": None, "address_uuid": "a1", "venue_uuid": None},
        {"id": "e2", "event_name": "Two", "setup_start": None, "event_start": "2026-11-12T18:00:00+00:00",
         "event_end": "2026-11-13T18:00:00+00:00", "teardown_end": None, "address_uuid": None, "venue_uuid": "v1"},
    ],
    "Venues": [{"id": "v1", "address_uuid": "a2"}],
    "Addresses": [{"id": "a1", "street": "1 Main St"}, {"id": "a2", "street": "2 Oak Ave"}],
    "WorkTrackers": [],
}


def repo_with(requests):
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        table = request.url.path.rsplit("/", 1)[1]
        if request.method == "POST":
            return httpx.Response(201, json=[{"id": f"wt{i}"} for i, _ in enumerate(json.loads(request.content))])
        return httpx.Response(200, json=TABLES[table])

    client = httpx.Client(transport=httpx.MockTransport(handler))
    return WorkTrackerRepository(SupabaseRest("https://x.supabase.co", "key", client))


def test_loads_each_bleachers_events_with_a_venue_address_fallback_and_local_days():
    requests = []
    (bleacher,) = repo_with(requests).load_bleachers("zone-1", "America/Edmonton")
    # 18:00 UTC is still the same day in Edmonton; 03:00 UTC on the 5th is the evening of the 4th.
    one, two = sorted(bleacher.stops, key=lambda s: s.start_date)
    assert (one.street, one.address_uuid, one.start_date, one.end_date) == ("1 Main St", "a1", "2026-11-02", "2026-11-04")
    assert (two.street, two.address_uuid) == ("2 Oak Ave", "a2")

    bleachers_request = requests[0]
    assert bleachers_request.url.params["zone_uuid"] == "eq.zone-1"
    assert bleachers_request.url.params["deleted"] == "eq.false"
    assert bleachers_request.headers["apikey"] == "key"
    events_request = next(r for r in requests if r.url.path.endswith("/Events"))
    assert events_request.url.params["event_status"] == "eq.booked"


def test_creates_draft_work_trackers_with_only_bleacher_dates_and_addresses():
    requests = []
    trip = NeededTrip("b1", 1, "a1", "1 Main St", "a2", "2 Oak Ave", "e1", "e2", "2026-11-05", "2026-11-12")
    ids = repo_with(requests).create_draft_work_trackers([trip], ["2026-11-09"])
    assert ids == ["wt0"]
    assert json.loads(requests[0].content) == [
        {"bleacher_uuid": "b1", "date": "2026-11-09", "status": "draft",
         "pickup_address_uuid": "a1", "dropoff_address_uuid": "a2"}
    ]
