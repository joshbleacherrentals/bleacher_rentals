import { describe, expect, it } from "vitest";
import { localDayEndInstant, localDayStartInstant } from "./localDayInstant";

describe("localDayStartInstant / localDayEndInstant", () => {
  it("brackets exactly the instants whose local date is the given day", () => {
    const start = localDayStartInstant("2026-09-20");
    const end = localDayEndInstant("2026-09-20");

    const noon = new Date(2026, 8, 20, 12, 0, 0).toISOString();
    const justBefore = new Date(2026, 8, 19, 23, 59, 59).toISOString();
    const justAfter = new Date(2026, 8, 21, 0, 0, 1).toISOString();

    expect(noon >= start && noon <= end).toBe(true);
    expect(justBefore >= start).toBe(false);
    expect(justAfter <= end).toBe(false);
  });

  it("puts the end of one day before the start of the next, with no gap a row can fall into", () => {
    const endOf20th = localDayEndInstant("2026-09-20");
    const startOf21st = localDayStartInstant("2026-09-21");

    expect(endOf20th < startOf21st).toBe(true);
    // 1ms apart: nothing can sort between them.
    expect(Date.parse(startOf21st) - Date.parse(endOf20th)).toBe(1);
  });

  it("ignores anything after the date in a timestamp-shaped argument", () => {
    // `bleacherTransportation` passes a full timestamp as the target date.
    expect(localDayEndInstant("2026-09-20T14:30:00.000Z")).toBe(localDayEndInstant("2026-09-20"));
  });
});
