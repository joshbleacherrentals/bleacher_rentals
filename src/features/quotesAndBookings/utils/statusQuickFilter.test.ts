import { describe, it, expect } from "vitest";
import { nextStatusPreset, presetOfStatuses, statusesForPreset } from "./statusQuickFilter";

describe("presetOfStatuses", () => {
  it("is 'all' when no status is filtered", () => {
    expect(presetOfStatuses([])).toBe("all");
  });

  it.each(["booked", "quoted", "lost", "draft"] as const)(
    "is '%s' for exactly that one status",
    (status) => {
      expect(presetOfStatuses([status])).toBe(status);
    },
  );

  it("is 'custom' for several statuses picked in the filter panel", () => {
    expect(presetOfStatuses(["booked", "quoted"])).toBe("custom");
  });

  it("is 'custom' for a single status the button does not cycle through", () => {
    expect(presetOfStatuses(["archived"])).toBe("custom");
  });
});

describe("nextStatusPreset", () => {
  it("cycles All -> Booked -> Quoted -> Lost -> Draft -> All", () => {
    expect(nextStatusPreset("all")).toBe("booked");
    expect(nextStatusPreset("booked")).toBe("quoted");
    expect(nextStatusPreset("quoted")).toBe("lost");
    expect(nextStatusPreset("lost")).toBe("draft");
    expect(nextStatusPreset("draft")).toBe("all");
  });

  it("starts the cycle at Booked from a custom selection", () => {
    expect(nextStatusPreset("custom")).toBe("booked");
  });
});

describe("statusesForPreset", () => {
  it("is empty (no filter) for 'all' and the one status otherwise", () => {
    expect(statusesForPreset("all")).toEqual([]);
    expect(statusesForPreset("booked")).toEqual(["booked"]);
    expect(statusesForPreset("quoted")).toEqual(["quoted"]);
    expect(statusesForPreset("lost")).toEqual(["lost"]);
    expect(statusesForPreset("draft")).toEqual(["draft"]);
  });
});
