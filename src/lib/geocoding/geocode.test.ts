import { describe, it, expect, vi } from "vitest";
import {
  geocodeAddress,
  geocodeQuery,
  judgeGeocode,
  parseGeocodeResponse,
  type GeocodeAnswer,
} from "./geocode";

const ADDR = {
  street: "100 Hersheypark Dr.",
  city: "Hershey",
  state_province: "Pennsylvania",
  zip_postal: "17022",
};
const result = (over: Record<string, unknown> = {}) => ({
  place_id: "ChIJabc",
  formatted_address: "100 Hersheypark Dr, Hershey, PA 17033, USA",
  types: ["street_address"],
  geometry: { location: { lat: 40.2884, lng: -76.6547 }, location_type: "ROOFTOP" },
  address_components: [
    { short_name: "Hershey", long_name: "Hershey", types: ["locality"] },
    { short_name: "PA", long_name: "Pennsylvania", types: ["administrative_area_level_1"] },
    { short_name: "US", long_name: "United States", types: ["country", "political"] },
  ],
  ...over,
});
const OK = { status: "OK", results: [result()] };
const respond = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
const answer = (over: Record<string, unknown> = {}) =>
  parseGeocodeResponse({ status: "OK", results: [result(over)] }) as GeocodeAnswer;

describe("geocodeQuery", () => {
  it("joins the parts of a plain street address", () => {
    expect(geocodeQuery(ADDR)).toBe("100 Hersheypark Dr., Hershey, Pennsylvania, 17022");
  });

  it("sends a street that already holds Google's whole description alone", () => {
    expect(
      geocodeQuery({
        street: "500 Boulevard Cote Vertu Ouest, Dorval, Montreal, QC H4S 1Y9, Canada",
        city: "Dorval",
        state_province: "Quebec",
        zip_postal: "H4S 1Y9",
      }),
    ).toBe("500 Boulevard Cote Vertu Ouest, Dorval, Montreal, QC H4S 1Y9, Canada");
  });

  it("has nothing to look up without a street or a city", () => {
    expect(
      geocodeQuery({ street: " ", city: null, state_province: "Ohio", zip_postal: "44101" }),
    ).toBeNull();
  });
});

describe("parseGeocodeResponse", () => {
  it("reads the position, place id, country, precision and state", () => {
    expect(parseGeocodeResponse(OK)).toMatchObject({
      latitude: 40.2884,
      longitude: -76.6547,
      place_id: "ChIJabc",
      country: "US",
      locationType: "ROOFTOP",
      partialMatch: false,
      state: { short: "PA", long: "Pennsylvania" },
    });
  });

  it("is null when Google found nothing or the answer is incomplete", () => {
    expect(parseGeocodeResponse({ status: "ZERO_RESULTS", results: [] })).toBeNull();
    expect(parseGeocodeResponse({ status: "OK", results: [{ place_id: "x" }] })).toBeNull();
  });
});

describe("judgeGeocode", () => {
  it("trusts a building or a point on the right street", () => {
    expect(judgeGeocode(ADDR, answer())).toEqual({ ok: true });
    const street = answer({
      geometry: { location: { lat: 1, lng: 2 }, location_type: "RANGE_INTERPOLATED" },
    });
    expect(judgeGeocode(ADDR, street).ok).toBe(true);
  });

  it("trusts the centre of a named place, such as a fairground", () => {
    const fair = answer({
      types: ["establishment", "point_of_interest"],
      geometry: { location: { lat: 1, lng: 2 }, location_type: "GEOMETRIC_CENTER" },
    });
    expect(judgeGeocode(ADDR, fair).ok).toBe(true);
  });

  it("refuses a town centre for an address that is only a town", () => {
    const town = answer({
      types: ["locality", "political"],
      geometry: { location: { lat: 1, lng: 2 }, location_type: "APPROXIMATE" },
    });
    expect(judgeGeocode({ ...ADDR, street: "Mason, TX, USA" }, town)).toEqual({
      ok: false,
      reason: "only a town or area, not an address",
    });
  });

  it("refuses the centre of a road", () => {
    const road = answer({
      types: ["route"],
      geometry: { location: { lat: 1, lng: 2 }, location_type: "GEOMETRIC_CENTER" },
    });
    expect(judgeGeocode(ADDR, road).ok).toBe(false);
  });

  it("trusts nothing for an address with no state or province, however precise Google is", () => {
    // "12 Winding Way" could be in London, Ontario or in Ohio.
    expect(
      judgeGeocode(
        { street: "12 Winding Way", city: null, state_province: null, zip_postal: null },
        answer(),
      ),
    ).toEqual({ ok: false, reason: "no state or province to know where it is" });
  });

  it("refuses a partial match, and an answer in another state", () => {
    expect(judgeGeocode(ADDR, answer({ partial_match: true })).ok).toBe(false);
    expect(judgeGeocode({ ...ADDR, state_province: "Ohio" }, answer())).toEqual({
      ok: false,
      reason: "Google put it in Pennsylvania",
    });
    // A state written as its code matches too.
    expect(judgeGeocode({ ...ADDR, state_province: "pa" }, answer()).ok).toBe(true);
  });
});

describe("geocodeAddress", () => {
  it("asks Google for the address with the key, and keeps a confident answer", async () => {
    const fetchFn = respond(OK);
    expect(await geocodeAddress(ADDR, "k1", fetchFn)).toEqual({
      latitude: 40.2884,
      longitude: -76.6547,
      place_id: "ChIJabc",
      country: "US",
    });
    const url = String((fetchFn.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("address=100%20Hersheypark%20Dr.%2C%20Hershey");
    expect(url).toContain("key=k1");
  });

  it("gives nothing rather than a town centre", async () => {
    const town = {
      status: "OK",
      results: [
        result({ geometry: { location: { lat: 1, lng: 2 }, location_type: "APPROXIMATE" } }),
      ],
    };
    expect(await geocodeAddress(ADDR, "k1", respond(town))).toBeNull();
  });

  it("never throws, and never calls Google without a key or anything to look up", async () => {
    const fetchFn = respond(OK);
    expect(await geocodeAddress({ ...ADDR, street: null, city: null }, "k1", fetchFn)).toBeNull();
    expect(await geocodeAddress(ADDR, "", fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();

    const failing = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await geocodeAddress(ADDR, "k1", failing as unknown as typeof fetch)).toBeNull();
    expect(await geocodeAddress(ADDR, "k1", respond({}, false))).toBeNull();
  });
});
