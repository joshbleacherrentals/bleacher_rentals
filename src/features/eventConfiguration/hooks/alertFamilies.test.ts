import { describe, expect, it } from "vitest";
import { TRANSPORTATION_ALERT_TITLES, mergeAlertFamily, sameAlertList } from "./alertFamilies";
import type { AlertPayload } from "@/features/alerts/types";

const alert = (
  title: string,
  message: string,
  description: string | null = null,
): AlertPayload => ({
  entity_uuid: "e-1",
  entity_type: "event",
  title,
  message,
  entity_description: description,
});

const transport = alert("No Transportation", "bleacher 1 is elsewhere");
const conflict = alert("Scheduling Conflict", "This event is overlapping with other events!");
const requirements = alert(
  "Event Requirements Not Met",
  "Seat mismatch: 150 required, 100 assigned.",
);

describe("mergeAlertFamily", () => {
  it("replaces only the titles the caller owns", () => {
    const merged = mergeAlertFamily([transport, conflict], ["Scheduling Conflict"], [requirements]);

    expect(merged).toEqual([transport, requirements]);
  });

  it("keeps the other family untouched when its owner computes nothing", () => {
    // The two hooks run independently; an empty result from one must never be
    // read as "clear everything".
    const merged = mergeAlertFamily([transport, conflict], ["Scheduling Conflict"], []);

    expect(merged).toEqual([transport]);
  });

  it("is order-independent between the two owners", () => {
    const transportFirst = mergeAlertFamily(
      mergeAlertFamily([], TRANSPORTATION_ALERT_TITLES, [transport]),
      ["Scheduling Conflict"],
      [conflict],
    );
    const conflictFirst = mergeAlertFamily(
      mergeAlertFamily([], ["Scheduling Conflict"], [conflict]),
      TRANSPORTATION_ALERT_TITLES,
      [transport],
    );

    expect([...transportFirst].sort(byTitle)).toEqual([...conflictFirst].sort(byTitle));
  });

  it("owns several titles at once", () => {
    const merged = mergeAlertFamily(
      [transport, conflict, requirements],
      ["Scheduling Conflict", "Event Requirements Not Met"],
      [conflict],
    );

    expect(merged).toEqual([transport, conflict]);
  });

  it("returns the incoming family when nothing was there before", () => {
    expect(mergeAlertFamily([], ["Scheduling Conflict"], [conflict])).toEqual([conflict]);
  });
});

describe("sameAlertList", () => {
  it("treats identical lists as unchanged so the store is not rewritten", () => {
    expect(sameAlertList([transport, conflict], [transport, conflict])).toBe(true);
  });

  it("notices a changed message", () => {
    expect(sameAlertList([conflict], [alert("Scheduling Conflict", "different")])).toBe(false);
  });

  it("notices a changed description even when the message is identical", () => {
    const withDescription = alert("Scheduling Conflict", conflict.message, "Event A");
    expect(sameAlertList([conflict], [withDescription])).toBe(false);
  });

  it("notices a different length", () => {
    expect(sameAlertList([conflict], [conflict, transport])).toBe(false);
  });

  it("notices reordering, because the store renders in order", () => {
    expect(sameAlertList([conflict, transport], [transport, conflict])).toBe(false);
  });

  it("treats two empty lists as unchanged", () => {
    expect(sameAlertList([], [])).toBe(true);
  });
});

function byTitle(a: AlertPayload, b: AlertPayload) {
  return a.title.localeCompare(b.title);
}
