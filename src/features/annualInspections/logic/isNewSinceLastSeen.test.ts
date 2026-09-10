import { describe, expect, it } from "vitest";
import { isNewSinceLastSeen } from "./isNewSinceLastSeen";

const TODAY = "2026-09-08";

// Timestamps here are written without a trailing "Z" on purpose: they are read
// as the reader's local clock, which is how a stored UTC instant is turned back
// into "the day I last looked at the page". Midday keeps every case a full
// twelve hours away from a date boundary, so no test depends on the runner's
// timezone.

describe("isNewSinceLastSeen", () => {
  it("highlights everything currently flagged for someone who has never opened the page", () => {
    // Due 2026-10-07: yellow began 2026-09-07, yesterday.
    expect(isNewSinceLastSeen("2026-10-07", TODAY, null)).toBe(true);
  });

  it("highlights nothing that is still ok for a first-time visitor", () => {
    expect(isNewSinceLastSeen("2027-01-01", TODAY, null)).toBe(false);
  });

  it("highlights a bleacher without a due date for nobody — there is no threshold to cross", () => {
    expect(isNewSinceLastSeen(null, TODAY, null)).toBe(false);
    expect(isNewSinceLastSeen(null, TODAY, "2026-09-01T12:00:00")).toBe(false);
  });

  it("highlights a warning crossed since the last visit", () => {
    // Yellow began 2026-09-07, six days after the last visit.
    expect(isNewSinceLastSeen("2026-10-07", TODAY, "2026-09-01T12:00:00")).toBe(true);
  });

  it("stops highlighting a warning the visitor has already seen", () => {
    // Due 2026-10-01, so yellow began 2026-09-01.
    expect(isNewSinceLastSeen("2026-10-01", TODAY, "2026-08-25T12:00:00")).toBe(true);
    expect(isNewSinceLastSeen("2026-10-01", TODAY, "2026-09-07T12:00:00")).toBe(false);
  });

  it("highlights again when it turns red, even though the yellow was already seen", () => {
    // Due 2026-09-15: yellow began 2026-08-16, red begins today.
    expect(isNewSinceLastSeen("2026-09-15", TODAY, "2026-09-07T12:00:00")).toBe(true);
  });

  it("highlights the day a bleacher goes overdue", () => {
    // Due 2026-09-07, so it tipped over yesterday.
    expect(isNewSinceLastSeen("2026-09-07", TODAY, "2026-09-06T12:00:00")).toBe(true);
  });

  it("goes quiet once every threshold is behind the last visit", () => {
    // Due 2026-08-01: yellow, red and overdue all crossed before the visit.
    expect(isNewSinceLastSeen("2026-08-01", TODAY, "2026-09-01T12:00:00")).toBe(false);
  });

  it("does not highlight a threshold that falls on the day of the last visit", () => {
    // Due 2026-10-01, yellow began 2026-09-01 — the visitor was on the page that
    // day and saw it. The window is (lastSeen, today]: open at the last visit,
    // closed at today.
    expect(isNewSinceLastSeen("2026-10-01", TODAY, "2026-09-01T12:00:00")).toBe(false);
  });

  it("does not highlight a threshold that is still in the future", () => {
    expect(isNewSinceLastSeen("2026-12-01", TODAY, "2026-09-01T12:00:00")).toBe(false);
  });

  it("reads the last visit as a calendar day, not an hour of the day", () => {
    // Due 2026-10-07, yellow began 2026-09-07 — the day of the visit either way.
    expect(isNewSinceLastSeen("2026-10-07", TODAY, "2026-09-07T00:01:00")).toBe(false);
    expect(isNewSinceLastSeen("2026-10-07", TODAY, "2026-09-07T23:59:00")).toBe(false);
  });
});
