import { describe, it, expect, vi } from "vitest";
import { GhostPulse, type GhostTrip } from "./GhostTrip";

function fakeTicker() {
  let tick: ((t: { deltaMS: number }) => void) | null = null;
  return {
    add: vi.fn((fn) => (tick = fn)),
    remove: vi.fn(() => (tick = null)),
    fire: (deltaMS: number) => tick?.({ deltaMS }),
    hasTick: () => tick !== null,
  };
}
const ghost = (parent: unknown = {}) =>
  ({ alpha: 1, destroyed: false, parent }) as unknown as GhostTrip;

describe("GhostPulse", () => {
  it("makes tracked ghosts flash between visible and faint", () => {
    const ticker = fakeTicker();
    const pulse = new GhostPulse(ticker);
    const g = ghost();
    pulse.track(g);
    const alphas = new Set<number>();
    for (let i = 0; i < 40; i++) {
      ticker.fire(50);
      alphas.add(g.alpha);
    }
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.1);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(1);
    expect(alphas.size).toBeGreaterThan(5);
  });

  it("forgets a ghost that was removed from the grid", () => {
    const ticker = fakeTicker();
    const pulse = new GhostPulse(ticker);
    const g = ghost(null);
    pulse.track(g);
    ticker.fire(50);
    expect(g.alpha).toBe(1); // untouched: it was dropped
  });

  it("stops ticking when destroyed", () => {
    const ticker = fakeTicker();
    const pulse = new GhostPulse(ticker);
    pulse.destroy();
    expect(ticker.remove).toHaveBeenCalled();
    expect(ticker.hasTick()).toBe(false);
  });
});
