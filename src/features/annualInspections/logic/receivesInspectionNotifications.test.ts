import { describe, expect, it } from "vitest";
import { receivesInspectionNotifications } from "./receivesInspectionNotifications";

describe("receivesInspectionNotifications", () => {
  it("notifies a maintainer — the queue is the one thing they are here for", () => {
    expect(receivesInspectionNotifications(["maintainer"])).toBe(true);
  });

  it("leaves an administrator alone, even though they can open the queue", () => {
    expect(receivesInspectionNotifications(["admin"])).toBe(false);
  });

  it("leaves a viewer alone — they read the queue, they are not chased by it", () => {
    expect(receivesInspectionNotifications(["viewer"])).toBe(false);
  });

  it("leaves an account manager, a developer and a driver alone", () => {
    expect(receivesInspectionNotifications(["account_manager"])).toBe(false);
    expect(receivesInspectionNotifications(["developer"])).toBe(false);
    expect(receivesInspectionNotifications(["driver"])).toBe(false);
  });

  it("notifies an administrator who is also a maintainer — the job is what counts", () => {
    expect(receivesInspectionNotifications(["admin", "maintainer"])).toBe(true);
  });

  it("stays quiet while the roles are still loading rather than flashing a badge", () => {
    expect(receivesInspectionNotifications([])).toBe(false);
  });
});
