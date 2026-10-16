import { describe, expect, it } from "vitest";
import { projectInfoColumns, validateProjectInfo, type ProjectInfoValue } from "./projectInfoValue";

const value: ProjectInfoValue = {
  eventName: "Gala",
  eventTypeId: "t1",
  status: "booked",
  lostReason: null,
  lostReasonNote: "",
  quoteValidTill: "",
};

describe("projectInfoColumns", () => {
  it("fills the Events columns, with an empty date as null", () => {
    expect(projectInfoColumns(value)).toEqual({
      event_name: "Gala",
      event_type_uuid: "t1",
      event_status: "booked",
      lost_reason: null,
      lost_reason_note: null,
      quote_valid_till: null,
    });
  });

  it("drops a lost reason once the status is no longer lost", () => {
    const columns = projectInfoColumns({ ...value, lostReason: "sold_out" });
    expect(columns.lost_reason).toBeNull();
  });
});

describe("validateProjectInfo", () => {
  it("accepts a complete value", () => {
    expect(validateProjectInfo(value)).toEqual([]);
  });

  it("requires an event name", () => {
    expect(validateProjectInfo({ ...value, eventName: "  " })).toEqual(["Event Name is required."]);
  });

  it("requires a reason for a lost quote", () => {
    expect(validateProjectInfo({ ...value, status: "lost" })).toHaveLength(1);
  });
});
