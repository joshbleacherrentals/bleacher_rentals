import { afterEach, describe, expect, it, vi } from "vitest";
import { watchWidth } from "./usePageWidth";

// docs/specs/accountant-collections-22-side-task-buttons.md §3 and §7. The hook itself is a ref and
// an effect around `watchWidth`; this project has no DOM test environment, so the logic the hook
// decides on (measure now, measure on every callback, stop on unmount, nothing without a
// ResizeObserver) is tested here with a stand-in observer.

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: unknown[] = [];
  disconnected = false;
  constructor(public callback: () => void) {
    FakeObserver.instances.push(this);
  }
  observe(target: unknown) {
    this.observed.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
}

const box = (clientWidth: number) => ({ clientWidth }) as unknown as HTMLElement;

afterEach(() => {
  FakeObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("watchWidth", () => {
  it("measures the box at once and watches it", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const el = box(1500);
    const onWidth = vi.fn();
    watchWidth(el, onWidth);
    expect(onWidth).toHaveBeenCalledTimes(1);
    expect(onWidth).toHaveBeenLastCalledWith(1500);
    expect(FakeObserver.instances).toHaveLength(1);
    expect(FakeObserver.instances[0].observed).toEqual([el]);
  });

  it("measures again on every callback of the observer, with the box's current width", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const el = { clientWidth: 1500 } as { clientWidth: number };
    const onWidth = vi.fn();
    watchWidth(el as unknown as HTMLElement, onWidth);

    el.clientWidth = 1200;
    FakeObserver.instances[0].callback();
    expect(onWidth).toHaveBeenLastCalledWith(1200);

    el.clientWidth = 1800;
    FakeObserver.instances[0].callback();
    expect(onWidth).toHaveBeenLastCalledWith(1800);
    expect(onWidth).toHaveBeenCalledTimes(3);
  });

  it("disconnects the observer when stopped", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const stop = watchWidth(box(1500), vi.fn());
    expect(FakeObserver.instances[0].disconnected).toBe(false);
    stop();
    expect(FakeObserver.instances[0].disconnected).toBe(true);
  });

  it("measures nothing without a ResizeObserver, so the width stays unknown", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const onWidth = vi.fn();
    const stop = watchWidth(box(1500), onWidth);
    expect(onWidth).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});
