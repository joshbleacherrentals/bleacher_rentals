import { describe, it, expect } from "vitest";
import { eventTypeDisplay } from "./eventTypeDisplay";

describe("eventTypeDisplay", () => {
  it("shows the type's name", () => {
    expect(
      eventTypeDisplay({ eventTypeUuid: "t1", name: "High School Football", isLoading: false }),
    ).toBe("High School Football");
  });

  it("says 'Not set' for a quote with no event type, without waiting on a lookup", () => {
    expect(eventTypeDisplay({ eventTypeUuid: null, name: null, isLoading: false })).toBe("Not set");
    expect(eventTypeDisplay({ eventTypeUuid: null, name: null, isLoading: true })).toBe("Not set");
  });

  it("shows nothing while the name is still loading, so 'Unknown' never flashes first", () => {
    expect(eventTypeDisplay({ eventTypeUuid: "t1", name: null, isLoading: true })).toBeNull();
  });

  it("says 'Unknown' when a type is set but its row cannot be found", () => {
    expect(eventTypeDisplay({ eventTypeUuid: "t1", name: null, isLoading: false })).toBe("Unknown");
    expect(eventTypeDisplay({ eventTypeUuid: "t1", name: "  ", isLoading: false })).toBe("Unknown");
  });

  it("trims the name", () => {
    expect(eventTypeDisplay({ eventTypeUuid: "t1", name: " Rodeo ", isLoading: false })).toBe(
      "Rodeo",
    );
  });
});
