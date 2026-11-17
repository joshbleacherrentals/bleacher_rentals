import { describe, it, expect, vi, afterEach } from "vitest";
import { acceptTrips, suggestTrips } from "./pythonTrips";
import type { SuggestedTrip } from "../utils/suggestions";

const trip: SuggestedTrip = {
  bleacherUuid: "b1",
  bleacherNumber: 1,
  fromAddressUuid: "a1",
  toAddressUuid: "a2",
  fromStreet: "1 Main",
  toStreet: "2 Oak",
  fromEventUuid: "e1",
  toEventUuid: "e2",
  date: "2026-11-10",
  availableFrom: "2026-11-05",
  mustArriveBy: "2026-11-12",
};

afterEach(() => vi.unstubAllGlobals());

describe("suggestTrips", () => {
  it("asks the service for the zone and week and reads the trips as camelCase", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        bleachers_in_zone: 3,
        trips: [
          {
            bleacher_uuid: "b1",
            bleacher_number: 1,
            from_address_uuid: "a1",
            to_address_uuid: "a2",
            from_street: "1 Main",
            to_street: "2 Oak",
            from_event_uuid: "e1",
            to_event_uuid: "e2",
            date: "2026-11-10",
            available_from: "2026-11-05",
            must_arrive_by: "2026-11-12",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await suggestTrips({ zoneId: "z1", weekStart: "2026-11-09" })).toEqual([trip]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/py/auto-work-trackers/suggest");
    expect(JSON.parse(init.body)).toMatchObject({ zone_id: "z1", week_start: "2026-11-09" });
  });

  it("throws with the status when the service fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(suggestTrips({ zoneId: "z", weekStart: "2026-11-09" })).rejects.toThrow("500");
  });
});

describe("acceptTrips", () => {
  it("sends the week and each trip's bleacher, date and addresses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ created: [], skipped: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await acceptTrips({ weekStart: "2026-11-09", trips: [trip] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/py/auto-work-trackers/accept");
    expect(JSON.parse(init.body)).toMatchObject({
      week_start: "2026-11-09",
      trips: [
        {
          bleacher_uuid: "b1",
          date: "2026-11-10",
          from_address_uuid: "a1",
          to_address_uuid: "a2",
        },
      ],
    });
  });

  it("throws with the status when the service fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    await expect(acceptTrips({ weekStart: "2026-11-09", trips: [trip] })).rejects.toThrow("422");
  });
});
