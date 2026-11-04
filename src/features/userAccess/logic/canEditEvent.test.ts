import { describe, it, expect } from "vitest";
import { canEditEvent } from "./canEditEvent";
import { canEditOwnedEntity } from "./canEditOwnedEntity";

// docs/specs/dashboard-events-read-only.md §4: the rule behind the +/– next to a bleacher and the
// colour palette on the dashboard. It is exactly what the event form's `canEdit` was.
const base = {
  isAdmin: false,
  isAccountManager: false,
  accountManagerZoneIds: [] as string[],
  leadZoneIds: [] as string[],
  userId: "me" as string | null,
  originalOwnerUserUuid: null as string | null,
  eventBleacherZoneIds: [] as string[],
};

describe("canEditEvent", () => {
  it("lets an admin change any event", () => {
    expect(canEditEvent({ ...base, isAdmin: true, originalOwnerUserUuid: "other" })).toBe(true);
  });

  it("lets an admin change an event with a bleacher from a zone nobody gave them", () => {
    expect(
      canEditEvent({
        ...base,
        isAdmin: true,
        originalOwnerUserUuid: "other",
        eventBleacherZoneIds: ["zone-x"],
      }),
    ).toBe(true);
  });

  describe("account manager", () => {
    const am = { ...base, isAccountManager: true, accountManagerZoneIds: ["zone-a"] };

    it("changes an event they own", () => {
      expect(canEditEvent({ ...am, originalOwnerUserUuid: "me" })).toBe(true);
    });

    it("does not change an event somebody else owns", () => {
      expect(canEditEvent({ ...am, originalOwnerUserUuid: "other" })).toBe(false);
    });

    it("does not change an event whose owner is unknown", () => {
      expect(canEditEvent({ ...am, originalOwnerUserUuid: null })).toBe(false);
    });

    it("changes any event when they lead a zone", () => {
      expect(canEditEvent({ ...am, leadZoneIds: ["zone-a"], originalOwnerUserUuid: "other" })).toBe(
        true,
      );
    });

    it("lets only the owner change an event with a bleacher from a zone they cannot access", () => {
      const withForeignBleacher = { ...am, eventBleacherZoneIds: ["zone-a", "zone-x"] };
      expect(canEditEvent({ ...withForeignBleacher, originalOwnerUserUuid: null })).toBe(false);
      expect(canEditEvent({ ...withForeignBleacher, originalOwnerUserUuid: "me" })).toBe(true);
      expect(canEditEvent({ ...withForeignBleacher, originalOwnerUserUuid: "other" })).toBe(false);
    });

    it("does not even let a lead change such an event unless they own it", () => {
      const lead = {
        ...am,
        leadZoneIds: ["zone-a"],
        eventBleacherZoneIds: ["zone-x"],
        originalOwnerUserUuid: "other",
      };
      expect(canEditEvent(lead)).toBe(false);
      expect(canEditEvent({ ...lead, originalOwnerUserUuid: "me" })).toBe(true);
    });

    it("says no without a user id", () => {
      expect(canEditEvent({ ...am, userId: null, originalOwnerUserUuid: "me" })).toBe(false);
    });
  });

  it("never lets a viewer or maintainer change anything", () => {
    // Neither role is admin or account manager, whatever else the store holds.
    expect(canEditEvent({ ...base, originalOwnerUserUuid: "me" })).toBe(false);
    expect(
      canEditEvent({
        ...base,
        accountManagerZoneIds: ["zone-a"],
        leadZoneIds: ["zone-a"],
        originalOwnerUserUuid: "me",
      }),
    ).toBe(false);
  });

  it("says no while the roles are not known yet", () => {
    expect(canEditEvent({ ...base })).toBe(false);
  });

  it("answers like canEditOwnedEntity for the same input", () => {
    const owners = [null, "me", "other"];
    const zoneSets = [[], ["zone-a"], ["zone-a", "zone-x"]];
    for (const isAdmin of [true, false]) {
      for (const lead of [[], ["zone-a"]]) {
        for (const owner of owners) {
          for (const eventBleacherZoneIds of zoneSets) {
            const input = {
              ...base,
              isAdmin,
              isAccountManager: true,
              accountManagerZoneIds: ["zone-a"],
              leadZoneIds: lead,
              originalOwnerUserUuid: owner,
              eventBleacherZoneIds,
            };
            expect(canEditEvent(input)).toBe(
              canEditOwnedEntity({
                isAdmin: input.isAdmin,
                isNew: false,
                isAccountManager: input.isAccountManager,
                accountManagerZoneIds: input.accountManagerZoneIds,
                leadZoneIds: input.leadZoneIds,
                createdByUserId: input.originalOwnerUserUuid,
                userId: input.userId,
                eventBleacherZoneIds: input.eventBleacherZoneIds,
              }),
            );
          }
        }
      }
    }
  });
});
