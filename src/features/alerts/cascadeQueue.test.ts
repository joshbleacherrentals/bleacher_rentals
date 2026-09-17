import { describe, expect, it } from "vitest";

import { runCascade } from "./cascadeQueue";

/** A runner whose completion the test controls, so overlap is deterministic. */
function deferredRunner() {
  const calls: Array<() => void> = [];
  let started = 0;

  const run = () => {
    started++;
    return new Promise<void>((resolve) => calls.push(resolve));
  };

  return {
    run,
    get started() {
      return started;
    },
    /** Let the oldest in-flight run finish, then yield to the microtask queue. */
    async finishOne() {
      const resolve = calls.shift();
      if (!resolve) throw new Error("no run in flight");
      resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("runCascade", () => {
  it("collapses a burst on one key into the run in flight plus one trailing run", async () => {
    const runner = deferredRunner();

    // Eight rapid drags of one tracker, the way a dashboard user produces them.
    const requests = Array.from({ length: 8 }, () => runCascade("wt-1", runner.run));
    expect(runner.started).toBe(1);

    await runner.finishOne(); // first run settles, trailing run starts
    expect(runner.started).toBe(2);

    await runner.finishOne();
    await Promise.all(requests);
    expect(runner.started).toBe(2);
  });

  it("does not collapse cascades for different work trackers", async () => {
    const runner = deferredRunner();

    const a = runCascade("wt-1", runner.run);
    const b = runCascade("wt-2", runner.run);

    expect(runner.started).toBe(2);

    await runner.finishOne();
    await runner.finishOne();
    await Promise.all([a, b]);
  });

  it("clears the key when a run rejects, so the next save cascades again", async () => {
    const failing = () => Promise.reject(new Error("triage blew up"));

    await expect(runCascade("wt-1", failing)).rejects.toThrow("triage blew up");

    let ranAgain = false;
    await runCascade("wt-1", async () => {
      ranAgain = true;
    });

    expect(ranAgain).toBe(true);
  });

  it("lets the trailing run observe state written after the first run began", async () => {
    const seen: string[] = [];
    let position = "A";

    const run = async () => {
      seen.push(position);
    };

    const first = runCascade("wt-1", run);
    position = "B";
    const second = runCascade("wt-1", run);

    await Promise.all([first, second]);

    // The point of the trailing run: it reflects where the tracker ended up,
    // not where it was when the burst started.
    expect(seen).toEqual(["A", "B"]);
  });
});
