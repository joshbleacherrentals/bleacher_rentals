import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowEntry } from "../utils/repairDetails";
import { useRepairWindowsStore } from "./useRepairWindowsStore";

// docs/specs/repairs-11-dashboard.md §2.7, §3 and §7: the stack of windows lives in a store, so the
// canvas of the Dashboard, the cell editor, the "+ Create" menu and the card of a report can all
// open a window. It is plain memory, and it uses `openWindow` and `closeFrom` of spec 07.

const repairEntry = (repairId: string): WindowEntry => ({ kind: "repair", repairId });
const newEntry = (): WindowEntry => ({ kind: "new" });

const store = () => useRepairWindowsStore.getState();

beforeEach(() => {
  store().reset();
});

describe("useRepairWindowsStore", () => {
  it("starts with an empty stack", () => {
    expect(store().stack).toEqual([]);
  });

  it("opens a window on an empty stack and on top of another", () => {
    store().open(repairEntry("r1"));
    store().open({ kind: "service", repairId: "r1", serviceId: "s1" });
    expect(store().stack.map((w) => w.kind)).toEqual(["repair", "service"]);
  });

  it("does not open the window that is already on top a second time", () => {
    store().open(repairEntry("r1"));
    store().open(repairEntry("r1"));
    expect(store().stack).toHaveLength(1);
    store().open(newEntry());
    store().open(newEntry());
    expect(store().stack.map((w) => w.kind)).toEqual(["repair", "new"]);
  });

  it("closes the window at an index and every window above it", () => {
    store().open(repairEntry("r1"));
    store().open({ kind: "service", repairId: "r1", serviceId: "s1" });
    store().open(newEntry());
    store().close(1);
    expect(store().stack).toEqual([repairEntry("r1")]);
    store().close(0);
    expect(store().stack).toEqual([]);
  });

  it("resets to an empty stack", () => {
    store().open(repairEntry("r1"));
    store().open(newEntry());
    store().reset();
    expect(store().stack).toEqual([]);
  });

  it("keeps the preset of a new entry, with its onCreated function", () => {
    const onCreated = vi.fn();
    store().open({
      kind: "new",
      preset: { eventStart: "2026-12-02", bleacherUuid: "b-52", requireService: true, onCreated },
    });
    const top = store().stack[0];
    expect(top.kind).toBe("new");
    if (top.kind !== "new") return;
    expect(top.preset?.eventStart).toBe("2026-12-02");
    expect(top.preset?.bleacherUuid).toBe("b-52");
    top.preset?.onCreated?.();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("does not change the array it replaced", () => {
    store().open(repairEntry("r1"));
    const before = store().stack;
    store().open(repairEntry("r2"));
    expect(before).toHaveLength(1);
    expect(store().stack).toHaveLength(2);
  });
});
