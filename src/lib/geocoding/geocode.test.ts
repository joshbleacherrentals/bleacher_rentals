import { describe, it, expect, vi } from "vitest";
import { geocodeAddress, geocodeQuery, parseGeocodeResponse } from "./geocode";

const ADDR = {
  street: "100 Hersheypark Dr.",
  city: "Hershey",
  state_province: "Pennsylvania",
  zip_postal: "17022",
};
const OK = {
  status: "OK",
  results: [
    {
      place_id: "ChIJabc",
      geometry: { location: { lat: 40.2884, lng: -76.6547 } },
      address_components: [
        { short_name: "Hershey", types: ["locality"] },
        { short_name: "US", types: ["country", "political"] },
      ],
    },
  ],
};
const respond = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

describe("geocodeQuery", () => {
  it("joins the parts that are filled", () => {
    expect(geocodeQuery(ADDR)).toBe("100 Hersheypark Dr., Hershey, Pennsylvania, 17022");
    expect(geocodeQuery({ ...ADDR, zip_postal: "" })).toBe(
      "100 Hersheypark Dr., Hershey, Pennsylvania",
    );
  });

  it("has nothing to look up without a street or a city", () => {
    expect(
      geocodeQuery({ street: " ", city: null, state_province: "Ohio", zip_postal: "44101" }),
    ).toBeNull();
  });
});

describe("parseGeocodeResponse", () => {
  it("takes the first result's position, place id and ISO-2 country", () => {
    expect(parseGeocodeResponse(OK)).toEqual({
      latitude: 40.2884,
      longitude: -76.6547,
      place_id: "ChIJabc",
      country: "US",
    });
  });

  it("is null when Google found nothing or the answer is incomplete", () => {
    expect(parseGeocodeResponse({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(parseGeocodeResponse({ status: "OK", results: [{ place_id: "x" }] })).toBeNull();
  });
});

describe("geocodeAddress", () => {
  it("asks Google for the joined address with the key", async () => {
    const fetchFn = respond(OK);
    expect(await geocodeAddress(ADDR, "k1", fetchFn)).toMatchObject({ place_id: "ChIJabc" });
    const url = String((fetchFn.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("address=100%20Hersheypark%20Dr.%2C%20Hershey");
    expect(url).toContain("key=k1");
  });

  it("never throws, and never calls Google without a key or anything to look up", async () => {
    const fetchFn = respond(OK);
    expect(await geocodeAddress(ADDR, undefined, fetchFn)).toBeNull();
    expect(await geocodeAddress({ ...ADDR, street: null, city: null }, "k1", fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();

    const failing = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await geocodeAddress(ADDR, "k1", failing as unknown as typeof fetch)).toBeNull();
    expect(await geocodeAddress(ADDR, "k1", respond({}, false))).toBeNull();
  });
});
