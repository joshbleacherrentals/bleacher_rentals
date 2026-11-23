import { describe, expect, it } from "vitest";
import { emptyRepairForm } from "./repairForm";
import {
  REQUIRE_SERVICE_MESSAGE,
  cellRepairDates,
  presetRepairForm,
  requiredServiceError,
  type NewRepairPreset,
} from "./newRepairPreset";
import {
  addDraftService,
  emptyServiceForm,
  removeDraftService,
  type ServicesDraft,
} from "./serviceForm";

// docs/specs/repairs-11-dashboard.md §2.4, §2.6, §3 and §7 (D216, D221 to D223, D229, D233): the days
// the icon of a cell gives the New repair window, what the window starts with, and the line that
// refuses a repair opened from a report that has no service.

const block = (eventStart: string, eventEnd: string) => ({ eventStart, eventEnd });

describe("cellRepairDates (D216)", () => {
  it("ends seven days after the start when there is no block", () => {
    expect(cellRepairDates("2026-11-23", [])).toEqual({
      eventStart: "2026-11-23",
      eventEnd: "2026-11-30",
    });
  });

  it("counts calendar days across a month, a year and a leap day", () => {
    expect(cellRepairDates("2026-11-28", []).eventEnd).toBe("2026-12-05");
    expect(cellRepairDates("2026-12-28", []).eventEnd).toBe("2027-01-04");
    expect(cellRepairDates("2028-02-25", []).eventEnd).toBe("2028-03-03");
  });

  it("cuts the end at the end of a block that holds the start", () => {
    const days = cellRepairDates("2026-11-23", [block("2026-11-20", "2026-11-25")]);
    expect(days).toEqual({ eventStart: "2026-11-23", eventEnd: "2026-11-25" });
  });

  it("cuts the end the day before a block that starts inside the seven days", () => {
    const days = cellRepairDates("2026-11-23", [block("2026-11-27", "2026-12-05")]);
    expect(days.eventEnd).toBe("2026-11-26");
  });

  it("makes the end equal the start when the next block starts the day after the start", () => {
    const days = cellRepairDates("2026-11-23", [block("2026-11-24", "2026-12-05")]);
    expect(days).toEqual({ eventStart: "2026-11-23", eventEnd: "2026-11-23" });
  });

  it("uses the earliest of several later blocks, whatever their order", () => {
    const days = cellRepairDates("2026-11-23", [
      block("2026-11-29", "2026-12-02"),
      block("2026-11-26", "2026-11-27"),
    ]);
    expect(days.eventEnd).toBe("2026-11-25");
  });

  it("is not changed by a block that ended before the start", () => {
    const days = cellRepairDates("2026-11-23", [block("2026-11-01", "2026-11-10")]);
    expect(days.eventEnd).toBe("2026-11-30");
  });

  it("is not changed by a block that starts after the seven days", () => {
    const days = cellRepairDates("2026-11-23", [block("2026-12-10", "2026-12-12")]);
    expect(days.eventEnd).toBe("2026-11-30");
  });

  it("takes the smaller end when one block holds the start and another starts later", () => {
    const days = cellRepairDates("2026-11-23", [
      block("2026-11-20", "2026-11-28"),
      block("2026-11-26", "2026-12-01"),
    ]);
    expect(days.eventEnd).toBe("2026-11-25");
  });

  it("reads the day from the first ten characters of an ISO time stamp", () => {
    const days = cellRepairDates("2026-11-23", [
      block("2026-11-27T00:00:00.000Z", "2026-12-05T23:59:59.000Z"),
    ]);
    expect(days.eventEnd).toBe("2026-11-26");
  });

  it("never ends before it starts", () => {
    const days = cellRepairDates("2026-11-23", [
      block("2026-11-23", "2026-11-23"),
      block("2026-11-24", "2026-11-30"),
    ]);
    expect(days).toEqual({ eventStart: "2026-11-23", eventEnd: "2026-11-23" });
  });
});

describe("presetRepairForm (D216, D221)", () => {
  it("is the empty form with no preset", () => {
    expect(presetRepairForm(undefined)).toEqual(emptyRepairForm());
  });

  it("puts the two days of the preset in and leaves the rest as the empty form", () => {
    const preset: NewRepairPreset = {
      eventStart: "2026-12-02",
      eventEnd: "2026-12-05",
      bleacherUuid: "b-52",
    };
    expect(presetRepairForm(preset)).toEqual({
      ...emptyRepairForm(),
      eventStart: "2026-12-02",
      eventEnd: "2026-12-05",
    });
  });

  it("leaves the days empty for a preset with only a bleacher (D223)", () => {
    expect(presetRepairForm({ bleacherUuid: "b-40", requireService: true })).toEqual(
      emptyRepairForm(),
    );
  });
});

describe("requiredServiceError (D222, D233)", () => {
  const service = (bleacherUuid: string) => ({
    ...emptyServiceForm(),
    bleacherUuid,
    severity: "minor" as const,
  });
  const withService = (bleacherUuid: string): ServicesDraft =>
    addDraftService([], "s1", service(bleacherUuid));

  it("has the line of the spec", () => {
    expect(REQUIRE_SERVICE_MESSAGE).toBe("Add at least one service.");
  });

  it("is null with no preset, and with a preset that does not require a service", () => {
    expect(requiredServiceError(undefined, [])).toBeNull();
    expect(requiredServiceError({ bleacherUuid: "b-1" }, [])).toBeNull();
    expect(requiredServiceError({ requireService: false }, [])).toBeNull();
  });

  it("gives the message when a service is required and the draft is empty", () => {
    expect(requiredServiceError({ requireService: true }, [])).toBe(REQUIRE_SERVICE_MESSAGE);
  });

  it("is null once there is a service, of any bleacher", () => {
    const preset = { requireService: true, bleacherUuid: "b-40" };
    expect(requiredServiceError(preset, withService("b-40"))).toBeNull();
    expect(requiredServiceError(preset, withService("b-99"))).toBeNull();
  });

  it("does not count a removed service", () => {
    const stored = [
      {
        id: "s1",
        stored: {} as never,
        initial: service("b-40"),
        values: service("b-40"),
        removed: true,
      },
    ];
    expect(requiredServiceError({ requireService: true }, stored)).toBe(REQUIRE_SERVICE_MESSAGE);
    // A service added and then removed leaves the draft empty.
    const gone = removeDraftService(withService("b-40"), "s1");
    expect(requiredServiceError({ requireService: true }, gone)).toBe(REQUIRE_SERVICE_MESSAGE);
  });
});
