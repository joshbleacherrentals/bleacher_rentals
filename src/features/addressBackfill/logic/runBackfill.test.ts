import { describe, it, expect, vi } from "vitest";
import type { GeocodeAnswer } from "@/lib/geocoding/geocode";
import type { BackfillAddress } from "./backfill";
import { CHUNK, runBackfill, type PlannedChange, type RunDeps } from "./runBackfill";

const row = (id: string, over: Partial<BackfillAddress> = {}): BackfillAddress => ({
  id,
  street: `${id} Main St`,
  city: "Hershey",
  state_province: "Pennsylvania",
  zip_postal: "17022",
  latitude: null,
  longitude: null,
  place_id: null,
  country: null,
  ...over,
});
const answer = (over: Partial<GeocodeAnswer> = {}): GeocodeAnswer => ({
  latitude: 40.28,
  longitude: -76.65,
  place_id: "P",
  country: "US",
  formattedAddress: "1 Main St, Hershey, PA, USA",
  locationType: "ROOFTOP",
  partialMatch: false,
  types: ["street_address"],
  state: { short: "PA", long: "Pennsylvania" },
  ...over,
});

class RateLimited extends Error {}

function deps(over: Partial<RunDeps> = {}) {
  const written: PlannedChange[][] = [];
  const d: RunDeps = {
    readTwins: async () => [],
    lookup: async () => answer(),
    isRateLimited: (e) => e instanceof RateLimited,
    write: async (changes) => {
      written.push(changes);
    },
    sleep: async () => {},
    ...over,
  };
  return { d, written };
}

describe("runBackfill", () => {
  it("copies from an identical address without asking Google, and logs before and after", async () => {
    const lookup = vi.fn(async () => answer());
    const twin = row("t", { street: "1 Main St", latitude: 1, longitude: 2, place_id: "T" });
    const { d, written } = deps({ readTwins: async () => [twin], lookup });
    const totals = await runBackfill([row("a", { street: "1 main st" })], d);
    expect(totals).toMatchObject({ scanned: 1, copied: 1, geocoded: 0 });
    expect(lookup).not.toHaveBeenCalled();
    expect(written[0][0]).toMatchObject({
      addressId: "a",
      source: "twin",
      before: { latitude: null, longitude: null, place_id: null, country: null },
      after: { latitude: 1, longitude: 2, place_id: "T" },
    });
  });

  it("asks Google once for identical addresses in the same run, and copies the answer", async () => {
    const lookup = vi.fn(async () => answer());
    const { d, written } = deps({ lookup });
    const totals = await runBackfill(
      [row("a", { street: "84328 Lucknow Line" }), row("b", { street: "84328 lucknow line" })],
      d,
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(totals).toMatchObject({ geocoded: 1, copied: 1 });
    expect(written.flat().map((c) => [c.addressId, c.source, c.after.latitude])).toEqual([
      ["a", "google", 40.28],
      ["b", "twin", 40.28],
    ]);
  });

  it("writes only confident Google answers and lists the rest with the reason", async () => {
    const lookup = vi.fn(async (a: BackfillAddress) =>
      a.id === "town" ? answer({ locationType: "APPROXIMATE", types: ["locality"] }) : answer(),
    );
    const { d, written } = deps({ lookup });
    const totals = await runBackfill(
      [
        row("ok"),
        row("town"),
        row("nostate", { state_province: null }),
        row("blank", { street: "", city: "" }),
      ],
      d,
    );
    expect(totals).toMatchObject({ geocoded: 1, uncertain: 2, noStreet: 1 });
    expect(written.flat().map((c) => c.addressId)).toEqual(["ok"]);
    expect(totals.review.map((r) => [r.id, r.reason])).toEqual([
      ["town", "only a town or area, not an address"],
      ["nostate", "no state or province to know where it is"],
      ["blank", "no street or city to look up"],
    ]);
  });

  it("writes nothing on a preview, looks at 20 at most, and lists every row", async () => {
    const { d, written } = deps();
    const rows = Array.from({ length: 30 }, (_, i) => row(`r${i}`));
    const totals = await runBackfill(rows, d, true);
    expect(written).toEqual([]);
    expect(totals.scanned).toBe(20);
    expect(totals.review).toHaveLength(20);
    expect(totals.review[0].outcome).toBe("google");
  });

  it("waits and tries again when Google asks to slow down, then gives up", async () => {
    let calls = 0;
    const lookup = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new RateLimited();
      return answer();
    });
    const { d } = deps({ lookup });
    expect((await runBackfill([row("a")], d)).geocoded).toBe(1);

    const always = vi.fn(async () => {
      throw new RateLimited();
    });
    await expect(runBackfill([row("b")], deps({ lookup: always }).d)).rejects.toBeInstanceOf(
      RateLimited,
    );
  });

  it("writes chunk by chunk and stops between chunks when asked", async () => {
    let stop = false;
    const { d, written } = deps({
      shouldStop: () => stop,
      onProgress: () => {
        stop = true;
      },
    });
    const rows = Array.from({ length: CHUNK + 5 }, (_, i) => row(`r${i}`));
    const totals = await runBackfill(rows, d);
    expect(written).toHaveLength(1);
    expect(totals.scanned).toBe(CHUNK);
  });
});
