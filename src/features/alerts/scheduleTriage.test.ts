import { beforeEach, describe, expect, it, vi } from "vitest";

const triage = vi.fn();
vi.mock("./triage", () => ({
  triage: (...args: unknown[]) => triage(...args),
}));

import { scheduleTriage } from "./scheduleTriage";

beforeEach(() => {
  triage.mockReset();
});

describe("scheduleTriage", () => {
  it("returns before the cascade finishes", async () => {
    let finished = false;
    triage.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve();
          }, 10),
        ),
    );

    scheduleTriage("WorkTrackers", { id: "wt-1" });

    // The save must not sit behind the cascade: that is the whole UX fix.
    expect(finished).toBe(false);
  });

  it("handles a failing cascade instead of leaving an unhandled rejection", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    triage.mockRejectedValue(new Error("cascade blew up"));

    scheduleTriage("WorkTrackers", { id: "wt-1" });

    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    consoleError.mockRestore();
  });

  it("passes the work tracker and its previous bleacher through", async () => {
    triage.mockResolvedValue(undefined);

    scheduleTriage("WorkTrackers", { id: "wt-1", previous_bleacher_uuid: "bleacher-A" });

    await vi.waitFor(() =>
      expect(triage).toHaveBeenCalledWith("WorkTrackers", {
        id: "wt-1",
        previous_bleacher_uuid: "bleacher-A",
      }),
    );
  });
});
