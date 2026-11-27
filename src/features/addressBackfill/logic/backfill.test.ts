import { describe, it, expect } from "vitest";
import {
  EMPTY_TOTALS,
  addTotals,
  addressKey,
  geoAfter,
  parseGeo,
  planRevert,
  stillAsWritten,
  twinValues,
  type BackfillAddress,
  type GeoValues,
  type LoggedChange,
} from "./backfill";

const row = (over: Partial<BackfillAddress>): BackfillAddress => ({
  id: "x",
  street: "100 Hersheypark Dr.",
  city: "Hershey",
  state_province: "Pennsylvania",
  zip_postal: "17022",
  latitude: null,
  longitude: null,
  place_id: null,
  country: null,
  ...over,
});
const EMPTY: GeoValues = { latitude: null, longitude: null, place_id: null, country: null };
const WROTE: GeoValues = { latitude: 40.28, longitude: -76.65, place_id: "P", country: "US" };

describe("addressKey", () => {
  it("ignores case, spacing and a trailing dot", () => {
    expect(addressKey(row({ street: "100  HERSHEYPARK Dr" }))).toBe(addressKey(row({})));
  });

  it("tells different cities apart", () => {
    expect(addressKey(row({ city: "Harrisburg" }))).not.toBe(addressKey(row({})));
  });
});

describe("geoAfter", () => {
  it("writes the position and place id, and never overwrites a country already set", () => {
    const found = { latitude: 1, longitude: 2, place_id: "P", country: "US" };
    expect(geoAfter(EMPTY, found)).toEqual({
      latitude: 1,
      longitude: 2,
      place_id: "P",
      country: "US",
    });
    expect(geoAfter({ ...EMPTY, country: "CA" }, found).country).toBe("CA");
  });
});

describe("twinValues", () => {
  const good = row({ id: "good", ...WROTE });

  it("copies the position, place id and country from an identical address", () => {
    expect(twinValues([row({ id: "m1", street: "100 hersheypark dr" })], [good]).get("m1")).toEqual(
      WROTE,
    );
  });

  it("never matches an address with no street, or a twin without a position", () => {
    const values = twinValues(
      [row({ id: "m1", street: "" }), row({ id: "m2" })],
      [row({ id: "nopos" }), good],
    );
    expect(values.has("m1")).toBe(false);
    expect(values.get("m2")?.latitude).toBe(40.28);
  });
});

describe("planRevert", () => {
  const change = (over: Partial<LoggedChange> = {}): LoggedChange => ({
    id: "c1",
    address_uuid: "a1",
    before: EMPTY,
    after: WROTE,
    reverted_at: null,
    ...over,
  });

  it("puts an address back while it still holds exactly what the run wrote", () => {
    const plan = planRevert([change()], new Map([["a1", WROTE]]));
    expect(plan.restore).toEqual([{ addressId: "a1", values: EMPTY, changeId: "c1" }]);
    expect(plan.changedSince).toBe(0);
  });

  it("leaves an address someone has edited since, so a revert never undoes a person's fix", () => {
    const fixedByHand = { ...WROTE, latitude: 40.3 };
    const plan = planRevert([change()], new Map([["a1", fixedByHand]]));
    expect(plan.restore).toEqual([]);
    expect(plan.changedSince).toBe(1);
  });

  it("skips a change already reverted, and one whose address is gone", () => {
    const plan = planRevert(
      [change({ reverted_at: "2026-11-27" }), change({ id: "c2", address_uuid: "gone" })],
      new Map([["a1", WROTE]]),
    );
    expect(plan.restore).toEqual([]);
    expect(plan.skipped).toBe(2);
  });
});

describe("stillAsWritten and parseGeo", () => {
  it("compares the four columns, tolerating float noise", () => {
    expect(stillAsWritten({ ...WROTE, latitude: 40.28 + 1e-12 }, WROTE)).toBe(true);
    expect(stillAsWritten({ ...WROTE, country: null }, WROTE)).toBe(false);
  });

  it("reads a logged JSON column back, and an unreadable one as empty", () => {
    expect(parseGeo(JSON.stringify(WROTE))).toEqual(WROTE);
    expect(parseGeo("not json")).toEqual(EMPTY);
    expect(parseGeo(null)).toEqual(EMPTY);
  });
});

describe("addTotals", () => {
  it("adds the counts and joins the review lists", () => {
    const r = (id: string) => ({
      id,
      text: id,
      google: null,
      outcome: "none" as const,
      reason: "x",
    });
    const a = {
      ...EMPTY_TOTALS,
      scanned: 100,
      copied: 10,
      geocoded: 80,
      uncertain: 4,
      review: [r("1")],
    };
    const b = { ...EMPTY_TOTALS, scanned: 50, notFound: 2, review: [r("2")] };
    expect(addTotals(addTotals(EMPTY_TOTALS, a), b)).toEqual({
      scanned: 150,
      copied: 10,
      geocoded: 80,
      uncertain: 4,
      notFound: 2,
      noStreet: 0,
      review: [r("1"), r("2")],
    });
  });
});
