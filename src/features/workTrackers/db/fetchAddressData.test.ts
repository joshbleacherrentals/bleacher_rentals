import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/providers/SystemProvider", () => ({ db: {} }));

import { toAddressData } from "./fetchAddressData";

describe("toAddressData", () => {
  it("keeps the map position, country and place id, so a populated address is saved whole", () => {
    expect(
      toAddressData({
        id: "a1",
        street: "100 Hersheypark Dr.",
        city: "Hershey",
        state_province: "Pennsylvania",
        zip_postal: "17022",
        latitude: 40.28,
        longitude: -76.65,
        country: "US",
        place_id: "ChIJabc",
      }),
    ).toEqual({
      addressUuid: "a1",
      address: "100 Hersheypark Dr.",
      city: "Hershey",
      state: "Pennsylvania",
      postalCode: "17022",
      lat: 40.28,
      lng: -76.65,
      country: "US",
      placeId: "ChIJabc",
    });
  });

  it("leaves out what the row does not have", () => {
    expect(
      toAddressData({
        id: "a2",
        street: null,
        city: null,
        state_province: null,
        zip_postal: null,
        latitude: null,
        longitude: null,
        country: null,
        place_id: null,
      }),
    ).toEqual({ addressUuid: "a2", address: "" });
  });
});
