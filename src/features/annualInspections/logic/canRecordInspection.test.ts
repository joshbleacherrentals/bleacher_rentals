import { describe, expect, it } from "vitest";
import { canRecordInspection } from "./canRecordInspection";

describe("canRecordInspection", () => {
  it("lets a maintainer record one — the queue is their job", () => {
    expect(canRecordInspection(["maintainer"])).toBe(true);
  });

  it("lets an administrator record one", () => {
    expect(canRecordInspection(["admin"])).toBe(true);
  });

  it("lets an account manager record one from the bleacher modal", () => {
    expect(canRecordInspection(["account_manager"])).toBe(true);
  });

  it("gives a viewer the history and no form — RLS would refuse the write anyway", () => {
    expect(canRecordInspection(["viewer"])).toBe(false);
  });

  it("gives a developer or a driver nothing", () => {
    expect(canRecordInspection(["developer"])).toBe(false);
    expect(canRecordInspection(["driver"])).toBe(false);
  });

  it("takes the most permissive role when someone holds several", () => {
    expect(canRecordInspection(["viewer", "maintainer"])).toBe(true);
    expect(canRecordInspection(["driver", "viewer"])).toBe(false);
  });

  it("refuses a user whose roles have not loaded yet rather than flashing a form", () => {
    expect(canRecordInspection([])).toBe(false);
  });
});
