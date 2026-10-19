import { describe, expect, it } from "vitest";
import {
  allowedStatuses,
  assertStatusTransition,
  canTransition,
  statusLabel,
} from "./statusTransitions";

describe("canTransition", () => {
  it("allows staying where it is, from every status", () => {
    for (const s of ["draft", "quoted", "booked", "unsigned_changes", "lost"] as const) {
      expect(canTransition(s, s)).toBe(true);
    }
  });

  it("never goes back to draft once the quote left it", () => {
    for (const from of ["quoted", "booked", "unsigned_changes", "lost"]) {
      expect(canTransition(from, "draft")).toBe(false);
    }
  });

  it("lets unsigned_changes become booked or lost, and nothing else", () => {
    expect(canTransition("unsigned_changes", "booked")).toBe(true);
    expect(canTransition("unsigned_changes", "lost")).toBe(true);
    expect(canTransition("unsigned_changes", "quoted")).toBe(false);
  });

  it("never sets unsigned_changes by hand: only the database does", () => {
    for (const from of ["draft", "quoted", "booked", "lost", null]) {
      expect(canTransition(from, "unsigned_changes")).toBe(false);
    }
  });

  it("allows lost from anywhere", () => {
    for (const from of ["draft", "quoted", "booked", "unsigned_changes", null]) {
      expect(canTransition(from, "lost")).toBe(true);
    }
  });
});

describe("allowedStatuses", () => {
  it("offers only what the saved status may become", () => {
    expect(allowedStatuses("draft")).toEqual(["draft", "quoted", "booked", "lost"]);
    expect(allowedStatuses("quoted")).toEqual(["quoted", "booked", "lost"]);
    expect(allowedStatuses("booked")).toEqual(["quoted", "booked", "lost"]);
    expect(allowedStatuses("unsigned_changes")).toEqual(["booked", "unsigned_changes", "lost"]);
    expect(allowedStatuses("lost")).toEqual(["quoted", "booked", "lost"]);
    expect(allowedStatuses(null)).toEqual(["draft", "quoted", "booked", "lost"]);
  });
});

describe("assertStatusTransition", () => {
  it("passes an allowed change and names the labels of a refused one", () => {
    expect(() => assertStatusTransition("quoted", "booked")).not.toThrow();
    expect(() => assertStatusTransition("quoted", "draft")).toThrow(
      "A quote that is Quote Sent cannot be changed to New.",
    );
  });
});

describe("statusLabel", () => {
  it("names each status for people, and shows an unknown one as it is", () => {
    expect(statusLabel("draft")).toBe("New");
    expect(statusLabel("quoted")).toBe("Quote Sent");
    expect(statusLabel("unsigned_changes")).toBe("Unsigned Changes");
    expect(statusLabel("weird")).toBe("weird");
    expect(statusLabel(null)).toBe("Unknown");
  });
});
