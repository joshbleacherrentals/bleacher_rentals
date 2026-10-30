import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./mapWithConcurrency";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("returns results in the order of the input", async () => {
    const out = await mapWithConcurrency([30, 5, 15], 3, async (ms) => {
      await sleep(ms);
      return ms;
    });

    expect(out).toEqual([30, 5, 15]);
  });

  it("never runs more than `limit` calls at once", async () => {
    let running = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await sleep(5);
      running--;
    });

    expect(peak).toBe(3);
  });

  it("handles an empty list and a limit below 1", async () => {
    expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async (x) => x * 2)).toEqual([2, 4]);
  });

  it("rejects when a call rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });
});
