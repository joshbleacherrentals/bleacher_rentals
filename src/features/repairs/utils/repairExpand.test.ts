import { describe, expect, it } from "vitest";
import {
  NO_EXPANSION,
  openRepairIds,
  reconcileExpansion,
  repairsListKey,
  toggleRepair,
} from "./repairExpand";
import { readRepairsUrlState } from "./repairPageState";

// docs/specs/repairs-06-expanded-row.md §2.5, §3 and §7 (D81, D82): which repairs are open lives
// in React and belongs to the state of the list in the address; a change of that state closes them.

const state = (query = "") => readRepairsUrlState(new URLSearchParams(query));

describe("repairsListKey", () => {
  it("is the same for the same state", () => {
    expect(repairsListKey(state("tab=completed&page=2"))).toBe(
      repairsListKey(state("page=2&tab=completed")),
    );
    expect(repairsListKey(state())).toBe(repairsListKey(state()));
  });

  it("changes with the tab, the page, the page size and the search", () => {
    const base = repairsListKey(state());
    expect(repairsListKey(state("tab=completed"))).not.toBe(base);
    expect(repairsListKey(state("page=2"))).not.toBe(base);
    expect(repairsListKey(state("pageSize=50"))).not.toBe(base);
    expect(repairsListKey(state("q=tire"))).not.toBe(base);
  });

  it("changes with each of the four filters, the sort and Show Deleted", () => {
    const base = repairsListKey(state());
    for (const query of [
      "bleachers=b1",
      "zones=z1",
      "vendors=v1",
      "categories=c1",
      "sort=total:desc",
      "showDeleted=1",
    ]) {
      expect(repairsListKey(state(query)), query).not.toBe(base);
    }
  });

  it("does not change with a parameter the page does not own", () => {
    expect(repairsListKey(state("utm_source=mail&foo=bar"))).toBe(repairsListKey(state()));
  });
});

describe("toggleRepair", () => {
  const key = repairsListKey(state());

  it("opens a closed repair and closes an open one", () => {
    const opened = toggleRepair(NO_EXPANSION, key, "r1");
    expect([...openRepairIds(opened, key)]).toEqual(["r1"]);
    const closed = toggleRepair(opened, key, "r1");
    expect([...openRepairIds(closed, key)]).toEqual([]);
  });

  it("keeps several repairs open together (D2)", () => {
    let expansion = toggleRepair(NO_EXPANSION, key, "r1");
    expansion = toggleRepair(expansion, key, "r2");
    expect([...openRepairIds(expansion, key)].sort()).toEqual(["r1", "r2"]);
    expansion = toggleRepair(expansion, key, "r1");
    expect([...openRepairIds(expansion, key)]).toEqual(["r2"]);
  });

  it("starts again from empty under another key (D82)", () => {
    const opened = toggleRepair(NO_EXPANSION, key, "r1");
    const otherKey = repairsListKey(state("tab=completed"));
    const next = toggleRepair(opened, otherKey, "r2");
    expect([...openRepairIds(next, otherKey)]).toEqual(["r2"]);
    expect([...openRepairIds(next, key)]).toEqual([]);
  });

  it("does not change its input", () => {
    const opened = toggleRepair(NO_EXPANSION, key, "r1");
    const snapshot = JSON.stringify(opened);
    toggleRepair(opened, key, "r2");
    toggleRepair(opened, key, "r1");
    expect(JSON.stringify(opened)).toBe(snapshot);
    expect(NO_EXPANSION).toEqual({ key: "", ids: [] });
  });
});

describe("openRepairIds", () => {
  it("gives the ids opened under the same key", () => {
    const key = repairsListKey(state("tab=completed"));
    const expansion = toggleRepair(NO_EXPANSION, key, "r9");
    expect(openRepairIds(expansion, key).has("r9")).toBe(true);
  });

  it("is empty under another key and for the empty expansion", () => {
    const key = repairsListKey(state());
    const expansion = toggleRepair(NO_EXPANSION, key, "r1");
    expect(openRepairIds(expansion, repairsListKey(state("page=3"))).size).toBe(0);
    expect(openRepairIds(NO_EXPANSION, key).size).toBe(0);
  });
});

// The page forgets the open repairs while it renders, as soon as the key has changed, so coming
// back to the first view does not bring them back (D82).
describe("reconcileExpansion", () => {
  const first = repairsListKey(state());
  const second = repairsListKey(state("page=2"));

  it("keeps the same expansion while the key is the same", () => {
    const opened = toggleRepair(NO_EXPANSION, first, "r1");
    expect(reconcileExpansion(opened, first)).toBe(opened);
  });

  it("forgets the open repairs when the key has changed", () => {
    const opened = toggleRepair(NO_EXPANSION, first, "r1");
    expect(reconcileExpansion(opened, second)).toBe(NO_EXPANSION);
  });

  it("does not bring a repair back when the first view returns", () => {
    const opened = toggleRepair(NO_EXPANSION, first, "r1");
    const forgotten = reconcileExpansion(opened, second);
    expect(openRepairIds(reconcileExpansion(forgotten, first), first).size).toBe(0);
  });

  it("leaves an empty expansion alone, so that rendering cannot loop", () => {
    const emptyUnderOldKey = toggleRepair(toggleRepair(NO_EXPANSION, first, "r1"), first, "r1");
    expect(reconcileExpansion(emptyUnderOldKey, second)).toBe(emptyUnderOldKey);
    expect(reconcileExpansion(NO_EXPANSION, first)).toBe(NO_EXPANSION);
  });
});
