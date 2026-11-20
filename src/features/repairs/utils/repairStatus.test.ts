import { describe, expect, it } from "vitest";
import { statusPill } from "./repairFormat";
import type { RepairStatus } from "./repairRows";
import {
  REPAIR_STATUSES,
  canChangeRepairStatus,
  reportIdsToClose,
  statusMenuEntries,
  statusPatch,
} from "./repairStatus";

// docs/specs/repairs-08-status.md §2.3, §3 and §7 (D112 to D118). The rules of the status menu are
// pure functions, so they are tested without React and without a database.

const NOW = "2026-11-20T15:30:00.000Z";
const report = (id: string) => ({ id, day: "2026-11-01", createdAt: "2026-11-01T12:00:00Z" });

describe("REPAIR_STATUSES", () => {
  it("lists the six statuses in the course of a repair (spec 05 D74)", () => {
    expect([...REPAIR_STATUSES]).toEqual([
      "inbound",
      "triaged",
      "waiting_repair",
      "in_repair",
      "confirm_repair",
      "completed",
    ]);
  });
});

describe("statusPatch", () => {
  it("is null when the status does not change", () => {
    for (const status of REPAIR_STATUSES) expect(statusPatch(status, status, NOW)).toBeNull();
  });

  it("writes the moment into completed_at when a repair moves into Completed (D112)", () => {
    expect(statusPatch("inbound", "completed", NOW)).toEqual({
      status: "completed",
      completedAt: NOW,
    });
    expect(statusPatch("confirm_repair", "completed", NOW)).toEqual({
      status: "completed",
      completedAt: NOW,
    });
  });

  it("clears completed_at when a repair moves out of Completed (D113)", () => {
    expect(statusPatch("completed", "in_repair", NOW)).toEqual({
      status: "in_repair",
      completedAt: null,
    });
    expect(statusPatch("completed", "inbound", NOW)).toEqual({
      status: "inbound",
      completedAt: null,
    });
  });

  it("leaves completed_at alone between two statuses that are not Completed", () => {
    expect(statusPatch("inbound", "triaged", NOW)).toEqual({
      status: "triaged",
      completedAt: undefined,
    });
    expect(statusPatch("in_repair", "inbound", NOW)).toEqual({
      status: "inbound",
      completedAt: undefined,
    });
  });

  it("follows the rule for every ordered pair of the six statuses (36 pairs, 6 of them null)", () => {
    let nulls = 0;
    for (const from of REPAIR_STATUSES) {
      for (const to of REPAIR_STATUSES) {
        const expected =
          from === to
            ? null
            : {
                status: to,
                completedAt: to === "completed" ? NOW : from === "completed" ? null : undefined,
              };
        expect(statusPatch(from, to, NOW), `${from} -> ${to}`).toEqual(expected);
        if (expected === null) nulls += 1;
      }
    }
    expect(nulls).toBe(6);
  });

  it("treats a stored word the code does not know as not Completed", () => {
    expect(statusPatch("archived", "completed", NOW)).toEqual({
      status: "completed",
      completedAt: NOW,
    });
    expect(statusPatch("archived", "triaged", NOW)).toEqual({
      status: "triaged",
      completedAt: undefined,
    });
  });
});

describe("reportIdsToClose", () => {
  const reported = [report("a"), report("b"), report("c")];

  it("gives the ids, in order, when a repair moves into Completed from another status (D116)", () => {
    expect(reportIdsToClose("in_repair", "completed", reported)).toEqual(["a", "b", "c"]);
    expect(reportIdsToClose("inbound", "completed", reported)).toEqual(["a", "b", "c"]);
  });

  it("gives none when the repair is already Completed, or moves out of it (D117)", () => {
    expect(reportIdsToClose("completed", "completed", reported)).toEqual([]);
    expect(reportIdsToClose("completed", "in_repair", reported)).toEqual([]);
  });

  it("gives none between two statuses that are not Completed", () => {
    expect(reportIdsToClose("inbound", "triaged", reported)).toEqual([]);
    expect(reportIdsToClose("confirm_repair", "in_repair", reported)).toEqual([]);
  });

  it("gives none when the repair has no reports", () => {
    expect(reportIdsToClose("in_repair", "completed", [])).toEqual([]);
  });
});

describe("canChangeRepairStatus", () => {
  it("is true only for a role that may, on a live repair (D110, D118)", () => {
    expect(canChangeRepairStatus({ allowed: true, deleted: false })).toBe(true);
    expect(canChangeRepairStatus({ allowed: true, deleted: true })).toBe(false);
    expect(canChangeRepairStatus({ allowed: false, deleted: false })).toBe(false);
    expect(canChangeRepairStatus({ allowed: false, deleted: true })).toBe(false);
  });
});

describe("statusMenuEntries", () => {
  it("has six entries in the order of the course, with the word of each pill", () => {
    const entries = statusMenuEntries("inbound");
    expect(entries.map((e) => e.status)).toEqual([...REPAIR_STATUSES]);
    for (const entry of entries) expect(entry.label).toBe(statusPill(entry.status).label);
  });

  it("gives every entry a background class for its dot", () => {
    for (const entry of statusMenuEntries("inbound")) {
      expect(entry.dotClassName).toMatch(/^bg-\[#[0-9a-f]{6}\]$/);
    }
  });

  it("gives every status a different dot", () => {
    const dots = statusMenuEntries("inbound").map((e) => e.dotClassName);
    expect(new Set(dots).size).toBe(6);
  });

  it("ticks exactly the current status, for each of the six", () => {
    for (const current of REPAIR_STATUSES as readonly RepairStatus[]) {
      const entries = statusMenuEntries(current);
      expect(entries.filter((e) => e.current).map((e) => e.status)).toEqual([current]);
    }
  });

  it("ticks nothing for a word the code does not know", () => {
    expect(statusMenuEntries("archived").some((e) => e.current)).toBe(false);
  });
});
