import { describe, expect, it, vi } from "vitest";
import {
  DRIVER_WITH_META_QUERY_KEY,
  DRIVERS_FOR_WEEK_QUERY_KEY,
  invalidateGroupQueries,
} from "./invalidateGroupQueries";

describe("invalidateGroupQueries", () => {
  it("makes the driver page's read of the week fetch again — its status button depends on it", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateGroupQueries({ invalidateQueries });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [DRIVER_WITH_META_QUERY_KEY],
      refetchType: "active",
    });
  });

  it("still refreshes the driver list's key, as every handler did before", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateGroupQueries({ invalidateQueries });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [DRIVERS_FOR_WEEK_QUERY_KEY],
      refetchType: "active",
    });
  });

  it("waits for both refetches before it resolves", async () => {
    const order: string[] = [];
    const invalidateQueries = vi.fn(async (filters?: { queryKey?: readonly unknown[] }) => {
      await Promise.resolve();
      order.push(String(filters?.queryKey?.[0]));
    });

    await invalidateGroupQueries({ invalidateQueries });

    expect(order.sort()).toEqual([DRIVER_WITH_META_QUERY_KEY, DRIVERS_FOR_WEEK_QUERY_KEY].sort());
  });
});
