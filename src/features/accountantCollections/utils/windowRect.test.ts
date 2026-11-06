import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampRect,
  DEFAULT_RECT,
  KEEP_VISIBLE,
  MIN_SIZE,
  moveRect,
  parseStoredRect,
  readStoredRect,
  resizeRect,
  writeStoredRect,
} from "./windowRect";

// docs/specs/accountant-collections-14-new-task-window.md §3 and §5.

const BIG = { w: 1920, h: 1080 };
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the defaults", () => {
  it("are the design's place and size, the minimum, and the 48 px title bar", () => {
    expect(DEFAULT_RECT).toEqual({ x: 730, y: 250, w: 430, h: 360 });
    expect(MIN_SIZE).toEqual({ w: 320, h: 240 });
    expect(KEEP_VISIBLE).toBe(48);
  });
});

describe("clampRect", () => {
  it("leaves a window that fits where it is", () => {
    expect(clampRect(DEFAULT_RECT, BIG)).toEqual(DEFAULT_RECT);
  });

  it("pulls the whole window inside: past the right and bottom edges, and before 0", () => {
    expect(clampRect(DEFAULT_RECT, { w: 1000, h: 600 })).toEqual(rect(570, 240, 430, 360));
    expect(clampRect(rect(-50, -20, 430, 360), BIG)).toEqual(rect(0, 0, 430, 360));
  });

  it("shrinks a window wider or taller than a small screen to the screen", () => {
    expect(clampRect(DEFAULT_RECT, { w: 400, h: 300 })).toEqual(rect(0, 0, 400, 300));
  });

  it("gives the screen's own width and height when the screen is under the minimum", () => {
    expect(clampRect(DEFAULT_RECT, { w: 300, h: 200 })).toEqual(rect(0, 0, 300, 200));
  });

  it("raises a window smaller than the minimum to the minimum", () => {
    expect(clampRect(rect(10, 10, 100, 50), BIG)).toEqual(rect(10, 10, 320, 240));
  });
});

describe("moveRect", () => {
  const start = rect(500, 300, 430, 360);

  it("follows the pointer and keeps the size", () => {
    expect(moveRect(start, 40, -30, BIG)).toEqual(rect(540, 270, 430, 360));
  });

  it("stops at the left and top edges", () => {
    expect(moveRect(start, -2000, 0, BIG).x).toBe(0);
    expect(moveRect(start, 0, -2000, BIG).y).toBe(0);
  });

  it("stops at the right edge with the whole width on screen", () => {
    expect(moveRect(start, 5000, 0, BIG).x).toBe(BIG.w - 430);
  });

  it("lets the body hang off the bottom while the top 48 px stay on screen", () => {
    expect(moveRect(start, 0, 5000, BIG).y).toBe(BIG.h - KEEP_VISIBLE);
    expect(moveRect(start, 0, 5000, BIG).h).toBe(360);
  });

  it("holds a window wider than the screen at the left edge, and a screen under 48 px at the top", () => {
    expect(moveRect(rect(0, 0, 500, 300), 100, 0, { w: 400, h: 600 }).x).toBe(0);
    expect(moveRect(rect(0, 0, 400, 300), 0, 100, { w: 800, h: 30 }).y).toBe(0);
  });
});

describe("resizeRect", () => {
  const start = rect(100, 100, 430, 360);

  it("the east edge changes only the width", () => {
    expect(resizeRect(start, "e", 70, 90, BIG)).toEqual(rect(100, 100, 500, 360));
  });

  it("the south edge changes only the height", () => {
    expect(resizeRect(start, "s", 70, 90, BIG)).toEqual(rect(100, 100, 430, 450));
  });

  it("the south-east corner changes both", () => {
    expect(resizeRect(start, "se", 70, 90, BIG)).toEqual(rect(100, 100, 500, 450));
  });

  it("holds the minimum size", () => {
    expect(resizeRect(start, "e", -5000, 0, BIG).w).toBe(MIN_SIZE.w);
    expect(resizeRect(start, "s", 0, -5000, BIG).h).toBe(MIN_SIZE.h);
    expect(resizeRect(start, "se", -5000, -5000, BIG)).toEqual(
      rect(100, 100, MIN_SIZE.w, MIN_SIZE.h),
    );
  });

  it("cannot grow past the screen edge", () => {
    const vp = { w: 1000, h: 700 };
    expect(resizeRect(rect(600, 300, 300, 300), "e", 5000, 0, vp).w).toBe(400);
    expect(resizeRect(rect(600, 300, 300, 300), "s", 0, 5000, vp).h).toBe(400);
    expect(resizeRect(rect(600, 300, 300, 300), "se", 5000, 5000, vp)).toEqual(
      rect(600, 300, 400, 400),
    );
  });

  it("does not grow a window that already hangs off the bottom, but can shrink it to the minimum", () => {
    const hanging = rect(100, 600, 430, 300);
    const vp = { w: 1000, h: 700 };
    expect(resizeRect(hanging, "s", 0, 50, vp).h).toBe(300);
    expect(resizeRect(hanging, "s", 0, -20, vp).h).toBe(280);
    expect(resizeRect(hanging, "s", 0, -500, vp).h).toBe(MIN_SIZE.h);
  });

  it("keeps the screen's own size on a screen under the minimum", () => {
    const vp = { w: 300, h: 200 };
    const full = rect(0, 0, 300, 200);
    expect(resizeRect(full, "se", 50, 50, vp)).toEqual(full);
    expect(resizeRect(full, "se", -100, -100, vp)).toEqual(full);
  });
});

describe("parseStoredRect", () => {
  it("reads what writeStoredRect wrote", () => {
    expect(parseStoredRect(JSON.stringify(rect(10, 20, 330, 250)))).toEqual(rect(10, 20, 330, 250));
  });

  it("keeps only the four numbers", () => {
    expect(parseStoredRect('{"x":1,"y":2,"w":3,"h":4,"extra":true}')).toEqual(rect(1, 2, 3, 4));
  });

  it("gives null for nothing, garbage and the wrong kind of JSON", () => {
    for (const raw of [null, "", "not json", "{", "null", "[]", "42", '"text"', "true"]) {
      expect(parseStoredRect(raw), String(raw)).toBeNull();
    }
  });

  it("gives null when a field is missing", () => {
    for (const field of ["x", "y", "w", "h"]) {
      const partial: Record<string, number> = { x: 1, y: 2, w: 3, h: 4 };
      delete partial[field];
      expect(parseStoredRect(JSON.stringify(partial)), field).toBeNull();
    }
  });

  it("gives null when a number is a string", () => {
    expect(parseStoredRect('{"x":"730","y":250,"w":430,"h":360}')).toBeNull();
    expect(parseStoredRect('{"x":730,"y":250,"w":430,"h":"360"}')).toBeNull();
  });

  it("gives null for a negative number in any field", () => {
    for (const field of ["x", "y", "w", "h"]) {
      const bad: Record<string, number> = { x: 1, y: 2, w: 3, h: 4, [field]: -1 };
      expect(parseStoredRect(JSON.stringify(bad)), field).toBeNull();
    }
  });

  it("gives null for a number that is not finite", () => {
    expect(parseStoredRect('{"x":1e999,"y":1,"w":1,"h":1}')).toBeNull();
    expect(parseStoredRect('{"x":null,"y":1,"w":1,"h":1}')).toBeNull();
  });
});

describe("readStoredRect and writeStoredRect", () => {
  const KEY = "accountantCollections.newTaskWindow";

  function stubStorage() {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
    return store;
  }

  it("keeps the geometry under one key", () => {
    const store = stubStorage();
    writeStoredRect(rect(10, 20, 330, 250));
    expect([...store.keys()]).toEqual([KEY]);
    expect(JSON.parse(store.get(KEY)!)).toEqual(rect(10, 20, 330, 250));
    expect(readStoredRect()).toEqual(rect(10, 20, 330, 250));
  });

  it("gives null when nothing or garbage is stored", () => {
    const store = stubStorage();
    expect(readStoredRect()).toBeNull();
    store.set(KEY, "{broken");
    expect(readStoredRect()).toBeNull();
  });

  it("falls back to null on read and does nothing on write when the storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(readStoredRect()).toBeNull();
    expect(() => writeStoredRect(DEFAULT_RECT)).not.toThrow();
  });

  it("copes with no storage at all, as in a render outside the browser", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readStoredRect()).toBeNull();
    expect(() => writeStoredRect(DEFAULT_RECT)).not.toThrow();
  });
});
