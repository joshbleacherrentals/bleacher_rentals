import { describe, it, expect, vi } from "vitest";

const getGeocode = vi.fn();
vi.mock("use-places-autocomplete", () => ({ getGeocode: (args: unknown) => getGeocode(args) }));

import { GeocodeRateLimited, answerFromGeocoderResult, browserLookup } from "./browserGeocode";
import { judgeGeocode } from "./geocode";

const ADDR = {
  street: "100 Hersheypark Dr.",
  city: "Hershey",
  state_province: "Pennsylvania",
  zip_postal: "17022",
};
const RESULT = {
  place_id: "ChIJabc",
  formatted_address: "100 Hersheypark Dr, Hershey, PA 17033, USA",
  types: ["street_address"],
  geometry: { location: { lat: () => 40.2884, lng: () => -76.6547 }, location_type: "ROOFTOP" },
  address_components: [
    { short_name: "PA", long_name: "Pennsylvania", types: ["administrative_area_level_1"] },
    { short_name: "US", long_name: "United States", types: ["country"] },
  ],
};

describe("answerFromGeocoderResult", () => {
  it("reads a browser result (lat and lng are functions) into the shape judgeGeocode reads", () => {
    const answer = answerFromGeocoderResult(RESULT)!;
    expect(answer).toMatchObject({
      latitude: 40.2884,
      longitude: -76.6547,
      place_id: "ChIJabc",
      country: "US",
      locationType: "ROOFTOP",
      state: { short: "PA", long: "Pennsylvania" },
    });
    expect(judgeGeocode(ADDR, answer)).toEqual({ ok: true });
  });

  it("is null for a result with no position or place id", () => {
    expect(answerFromGeocoderResult(undefined)).toBeNull();
    expect(answerFromGeocoderResult({ ...RESULT, place_id: undefined })).toBeNull();
  });
});

describe("browserLookup", () => {
  it("asks Google for the address text and reads the first result", async () => {
    getGeocode.mockResolvedValueOnce([RESULT]);
    expect((await browserLookup(ADDR))?.place_id).toBe("ChIJabc");
    expect(getGeocode).toHaveBeenLastCalledWith({
      address: "100 Hersheypark Dr., Hershey, Pennsylvania, 17022",
    });
  });

  it("is null when Google finds nothing, and asks the caller to slow down when told to", async () => {
    getGeocode.mockRejectedValueOnce("ZERO_RESULTS");
    expect(await browserLookup(ADDR)).toBeNull();
    getGeocode.mockRejectedValueOnce("OVER_QUERY_LIMIT");
    await expect(browserLookup(ADDR)).rejects.toBeInstanceOf(GeocodeRateLimited);
    getGeocode.mockRejectedValueOnce("REQUEST_DENIED");
    await expect(browserLookup(ADDR)).rejects.toThrow("REQUEST_DENIED");
  });

  it("never calls Google with nothing to look up", async () => {
    getGeocode.mockClear();
    expect(await browserLookup({ ...ADDR, street: null, city: null })).toBeNull();
    expect(getGeocode).not.toHaveBeenCalled();
  });
});
