import { describe, expect, it } from "vitest";
import { displayState, displayStateLabel, displayStateOptions } from "./leadResponseState";

const lead = (status: string | null, hideLeadAlert = false, hasLeadSubmission = true) =>
  displayState({ status, hasLeadSubmission, hideLeadAlert });

describe("displayState", () => {
  it("is awaiting_response for an unanswered website request that is still a draft", () => {
    expect(lead("draft")).toBe("awaiting_response");
  });
  it("is responded once the alert is hidden", () => {
    expect(lead("draft", true)).toBe("responded");
  });
  it("is the stored status for a draft that did not come from the form", () => {
    expect(lead("draft", false, false)).toBe("draft");
    expect(lead("draft", true, false)).toBe("draft");
  });
  it("is the stored status once the quote left draft, whatever the flag", () => {
    for (const s of ["quoted", "booked", "unsigned_changes", "lost"]) {
      expect(lead(s)).toBe(s);
      expect(lead(s, true)).toBe(s);
    }
  });
});

describe("displayStateOptions", () => {
  it("offers Responded, Quote Sent, Quote Signed and Lost while waiting", () => {
    expect(displayStateOptions("awaiting_response")).toEqual([
      "responded",
      "quoted",
      "booked",
      "lost",
    ]);
  });
  it("offers Fresh Inbound, Quote Sent, Quote Signed and Lost once responded", () => {
    expect(displayStateOptions("responded")).toEqual([
      "awaiting_response",
      "quoted",
      "booked",
      "lost",
    ]);
  });
  it("leaves every other status to the usual transitions", () => {
    expect(displayStateOptions("quoted")).toEqual(["quoted", "booked", "lost"]);
  });
});

describe("displayStateLabel", () => {
  it("names the two lead states and falls back to the status labels", () => {
    expect(displayStateLabel("awaiting_response")).toBe("Fresh Inbound");
    expect(displayStateLabel("responded")).toBe("Responded");
    expect(displayStateLabel("draft")).toBe("New");
  });
});
