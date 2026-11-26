import { describe, it, expect, vi } from "vitest";
import { createLinxupClient, LinxupError, type FetchLike } from "./linxup";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createLinxupClient", () => {
  it("is null without a host or token", () => {
    expect(createLinxupClient(undefined, "t")).toBeNull();
    expect(createLinxupClient("https://x", "")).toBeNull();
  });

  it("reads current positions with the bearer token and skips rows without coordinates", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json({
        responseType: "Success",
        data: {
          locations: [
            {
              imei: "111",
              latitude: 27.9,
              longitude: -82.4,
              date: 1000,
              speed: 3,
              status: "Moving",
            },
            { imei: "222", latitude: null, longitude: null, date: 1000 },
          ],
        },
      }),
    );
    const client = createLinxupClient("https://app02.linxup.com/", "tok", fetchImpl)!;
    const positions = await client.currentPositions();
    expect(positions).toEqual([
      { imei: "111", latitude: 27.9, longitude: -82.4, date: 1000, speed: 3, status: "Moving" },
    ]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://app02.linxup.com/ibis/rest/api/v2/locations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("posts the stops window as fromDate / toDate in epoch ms", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json({
        responseType: "Success",
        data: {
          stops: [
            {
              imei: "111",
              latitude: 1,
              longitude: 2,
              beginDate: 10,
              endDate: 20,
              street: "1 Main",
              city: "Tampa",
              stateCode: "FL",
              geofenceName: "",
            },
          ],
        },
      }),
    );
    const client = createLinxupClient("https://h", "tok", fetchImpl)!;
    const stops = await client.stops(5, 50);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toEqual({
      fromDate: 5,
      toDate: 50,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://h/ibis/rest/api/v2/stops");
    expect(stops[0]).toMatchObject({ imei: "111", beginDate: 10, endDate: 20, geofenceName: null });
  });

  it("turns Linxup's in-body error into a LinxupError with its message", async () => {
    const client = createLinxupClient("https://h", "tok", async () =>
      json({ responseType: "Error", data: { message: "supported date range is within 48 hours" } }),
    )!;
    await expect(client.stops(0, 1)).rejects.toThrow(/within 48 hours/);
    await expect(client.stops(0, 1)).rejects.toBeInstanceOf(LinxupError);
  });

  it("reports an HTTP error and a network failure without the token", async () => {
    const bad = createLinxupClient("https://h", "secret-token", async () => json({}, 401))!;
    await expect(bad.currentPositions()).rejects.toThrow(/HTTP 401/);
    const down = createLinxupClient("https://h", "secret-token", async () => {
      throw new Error("ECONNRESET");
    })!;
    const err = (await down.currentPositions().catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/did not answer/);
    expect(err.message).not.toContain("secret-token");
  });
});
