import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionsListState } from "../utils/collectionsListState";
import type { CollectionsRow } from "../utils/collectionsRows";

// Spec: docs/specs/accountant-collections-10-prev-next.md §3 and §4. This repo has no DOM renderer,
// so (as in useUserAccess.test.ts) `useState` is replaced: here by a slot that survives from one
// call of the hook to the next, which is what a re-render is. `setState` during render writes the
// slot at once, as React's render-phase update does before it re-runs the component.

const mocks = vi.hoisted(() => ({
  collections: {
    rows: [] as unknown[],
    isLoading: false,
    error: undefined as Error | undefined,
    today: "2026-11-15",
  },
  slot: { current: undefined as unknown, used: false },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!mocks.slot.used) {
        mocks.slot.current = typeof initial === "function" ? (initial as () => unknown)() : initial;
        mocks.slot.used = true;
      }
      return [
        mocks.slot.current,
        (next: unknown) => {
          mocks.slot.current =
            typeof next === "function"
              ? (next as (p: unknown) => unknown)(mocks.slot.current)
              : next;
        },
      ];
    },
    useMemo: (factory: () => unknown) => factory(),
  };
});
vi.mock("./useCollectionsData", () => ({ useCollectionsData: () => mocks.collections }));

import { useTaskNeighbours } from "./useTaskNeighbours";

function row(id: string, amountDueCents: number): CollectionsRow {
  return {
    eventId: id,
    eventName: `Event ${id}`,
    taskId: `task-${id}`,
    dueDate: "2026-11-10",
    note: "Remind the customer about payment",
    amountDueCents,
    currency: "USD",
    daysOverdue: 10,
  };
}

const BY_AMOUNT: CollectionsListState = { sort: "amount", dir: "desc", showNotDue: false };
// Largest first: a, c, d, b.
const rows = () => [row("a", 40000), row("b", 10000), row("c", 30000), row("d", 20000)];

const NONE = { isReady: false, previousId: null, nextId: null };

function render(eventId: string, listState: CollectionsListState = BY_AMOUNT) {
  return useTaskNeighbours({ eventId, listState });
}

beforeEach(() => {
  mocks.slot.current = undefined;
  mocks.slot.used = false;
  mocks.collections.rows = rows();
  mocks.collections.isLoading = false;
  mocks.collections.today = "2026-11-15";
});

describe("useTaskNeighbours", () => {
  it("is not ready while the list is loading", () => {
    mocks.collections.isLoading = true;
    mocks.collections.rows = [];
    expect(render("c")).toEqual(NONE);
    expect(render("c")).toEqual(NONE);
  });

  it("fixes the neighbours the first time the list has loaded", () => {
    mocks.collections.isLoading = true;
    mocks.collections.rows = [];
    render("c");

    mocks.collections.isLoading = false;
    mocks.collections.rows = rows();
    expect(render("c")).toEqual({ isReady: true, previousId: "a", nextId: "d" });
  });

  it("leaves them as they were when the data changes later", () => {
    expect(render("c")).toEqual({ isReady: true, previousId: "a", nextId: "d" });

    // The event's task is completed, so it leaves the list, and another row arrives.
    mocks.collections.rows = [row("a", 40000), row("d", 20000), row("e", 25000), row("b", 10000)];
    expect(render("c")).toEqual({ isReady: true, previousId: "a", nextId: "d" });

    mocks.collections.rows = [];
    expect(render("c")).toEqual({ isReady: true, previousId: "a", nextId: "d" });
  });

  it("recomputes when the event is a different one", () => {
    expect(render("c")).toEqual({ isReady: true, previousId: "a", nextId: "d" });
    expect(render("d")).toEqual({ isReady: true, previousId: "c", nextId: "b" });
  });

  it("starts again from the data of that moment for a different event", () => {
    render("c");
    mocks.collections.rows = [row("a", 40000), row("d", 20000), row("b", 10000)];
    expect(render("d")).toEqual({ isReady: true, previousId: "a", nextId: "b" });
  });

  it("gives two nulls, and keeps them, for an event outside the list", () => {
    expect(render("zzz")).toEqual({ isReady: true, previousId: null, nextId: null });

    mocks.collections.rows = [...rows(), row("zzz", 50000)];
    expect(render("zzz")).toEqual({ isReady: true, previousId: null, nextId: null });
  });

  it("has no previous at the first row and no next at the last", () => {
    expect(render("a")).toEqual({ isReady: true, previousId: null, nextId: "c" });
    mocks.slot.current = undefined;
    expect(render("b")).toEqual({ isReady: true, previousId: "d", nextId: null });
  });

  it("follows the list's state: Show Not Due Yet brings a future task into the order", () => {
    mocks.collections.rows = [...rows(), { ...row("f", 35000), dueDate: "2026-11-20" }];
    expect(render("c", BY_AMOUNT)).toEqual({ isReady: true, previousId: "a", nextId: "d" });

    mocks.slot.current = undefined;
    expect(render("c", { ...BY_AMOUNT, showNotDue: true })).toEqual({
      isReady: true,
      previousId: "f",
      nextId: "d",
    });
  });
});
