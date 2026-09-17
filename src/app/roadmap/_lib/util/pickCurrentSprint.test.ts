import { describe, it, expect } from "vitest";
import { pickCurrentSprint } from "./pickCurrentSprint";

const sprint5 = { id: "s5", quarter_id: "q3", start_date: "2026-08-31", end_date: "2026-09-11" };
const sprint6 = { id: "s6", quarter_id: "q3", start_date: "2026-09-14", end_date: "2026-09-25" };
const sprint1 = { id: "s1", quarter_id: "q4", start_date: "2026-10-05", end_date: "2026-10-16" };

describe("pickCurrentSprint", () => {
  it("returns the sprint that today falls inside", () => {
    expect(pickCurrentSprint([sprint5, sprint6, sprint1], "2026-09-17")?.id).toBe("s6");
  });

  it("counts the first and last day as part of the sprint", () => {
    expect(pickCurrentSprint([sprint5, sprint6], "2026-09-14")?.id).toBe("s6");
    expect(pickCurrentSprint([sprint5, sprint6], "2026-09-11")?.id).toBe("s5");
  });

  it("keeps the previous sprint during the gap before the next one starts", () => {
    expect(pickCurrentSprint([sprint5, sprint6], "2026-09-13")?.id).toBe("s5");
  });

  it("does not depend on input order", () => {
    expect(pickCurrentSprint([sprint1, sprint6, sprint5], "2026-09-12")?.id).toBe("s5");
  });

  it("returns null when no sprint has started yet", () => {
    expect(pickCurrentSprint([sprint6, sprint1], "2026-09-01")).toBeNull();
    expect(pickCurrentSprint([], "2026-09-17")).toBeNull();
  });

  it("ignores sprints with no start date", () => {
    expect(pickCurrentSprint([sprint5, { ...sprint6, start_date: null }], "2026-09-17")?.id).toBe(
      "s5",
    );
  });
});
