import { describe, it, expect } from "vitest";
import { canEditCell } from "./canEditCell";

describe("canEditCell (Dashboard cell editing)", () => {
  const zoneA = "zone-a";
  const zoneB = "zone-b";
  const ownBleacher = { zoneUuid: zoneA };
  const otherBleacher = { zoneUuid: zoneB };

  // ═══ Admin ═══

  it("admin can always edit a cell", () => {
    expect(
      canEditCell({
        isAdmin: true,
        isAccountManager: false,
        accountManagerZoneIds: [],
        bleacherUuid: "b-1",
        bleacher: otherBleacher,
      }),
    ).toBe(true);
  });

  it("admin can edit even without bleacher data", () => {
    expect(
      canEditCell({
        isAdmin: true,
        isAccountManager: false,
        accountManagerZoneIds: [],
        bleacherUuid: null,
        bleacher: null,
      }),
    ).toBe(true);
  });

  // ═══ Viewer ═══

  it("viewer cannot edit any cell", () => {
    expect(
      canEditCell({
        isAdmin: false,
        isAccountManager: false,
        accountManagerZoneIds: [],
        bleacherUuid: "b-1",
        bleacher: ownBleacher,
      }),
    ).toBe(false);
  });

  // ═══ AM: own zone ═══

  it("AM can edit cell of bleacher in their zone", () => {
    expect(
      canEditCell({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: [zoneA],
        bleacherUuid: "b-1",
        bleacher: ownBleacher,
      }),
    ).toBe(true);
  });

  // ═══ AM: other zone ═══

  it("AM cannot edit cell of bleacher in another zone", () => {
    expect(
      canEditCell({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: [zoneA],
        bleacherUuid: "b-1",
        bleacher: otherBleacher,
      }),
    ).toBe(false);
  });

  it("AM cannot edit bleacher with no zone", () => {
    expect(
      canEditCell({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: [zoneA],
        bleacherUuid: "b-1",
        bleacher: { zoneUuid: null },
      }),
    ).toBe(false);
  });

  // ═══ AM: edge cases ═══

  it("AM cannot edit when bleacherUuid is null", () => {
    expect(
      canEditCell({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: [zoneA],
        bleacherUuid: null,
        bleacher: null,
      }),
    ).toBe(false);
  });

  it("AM cannot edit when bleacher data is not found", () => {
    expect(
      canEditCell({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: [zoneA],
        bleacherUuid: "b-unknown",
        bleacher: null,
      }),
    ).toBe(false);
  });

  it("AM cannot edit when they have no zones", () => {
    expect(
      canEditCell({
        isAdmin: false,
        isAccountManager: true,
        accountManagerZoneIds: [],
        bleacherUuid: "b-1",
        bleacher: ownBleacher,
      }),
    ).toBe(false);
  });
  // ═══ Maintainer: only their own notes (docs/specs/maintainer-dashboard-cells.md) ═══

  describe("maintainer", () => {
    const me = "user-me";
    const someoneElse = "user-other";
    const maintainer = {
      isAdmin: false,
      isAccountManager: false,
      isMaintainer: true,
      accountManagerZoneIds: [] as string[],
      currentUserUuid: me,
      bleacherUuid: "b-1",
      bleacher: otherBleacher,
    };

    it("can write into an empty cell", () => {
      expect(canEditCell({ ...maintainer, block: null })).toBe(true);
    });

    it("can write into an empty cell when no block is passed at all", () => {
      expect(canEditCell({ ...maintainer })).toBe(true);
    });

    it("can edit a note they wrote themselves", () => {
      expect(canEditCell({ ...maintainer, block: { createdByUserUuid: me } })).toBe(true);
    });

    it("cannot edit a note someone else wrote", () => {
      expect(canEditCell({ ...maintainer, block: { createdByUserUuid: someoneElse } })).toBe(false);
    });

    it("cannot edit an old note that has no author", () => {
      expect(canEditCell({ ...maintainer, block: { createdByUserUuid: null } })).toBe(false);
    });

    it("treats a client that has not synced the author column as someone else's note", () => {
      const stale = { createdByUserUuid: undefined } as unknown as { createdByUserUuid: null };
      expect(canEditCell({ ...maintainer, block: stale })).toBe(false);
    });

    it("cannot edit a note while the current user is unknown", () => {
      expect(
        canEditCell({ ...maintainer, currentUserUuid: null, block: { createdByUserUuid: null } }),
      ).toBe(false);
      expect(
        canEditCell({ ...maintainer, currentUserUuid: null, block: { createdByUserUuid: me } }),
      ).toBe(false);
    });

    it("is not limited to a zone", () => {
      expect(canEditCell({ ...maintainer, bleacher: { zoneUuid: null }, block: null })).toBe(true);
      expect(
        canEditCell({ ...maintainer, bleacher: ownBleacher, block: { createdByUserUuid: me } }),
      ).toBe(true);
    });

    it("cannot edit a cell with no bleacher", () => {
      expect(canEditCell({ ...maintainer, bleacherUuid: null, bleacher: null, block: null })).toBe(
        false,
      );
    });

    it("loses everything when the maintainer flag is off (a viewer)", () => {
      expect(canEditCell({ ...maintainer, isMaintainer: false, block: null })).toBe(false);
      expect(
        canEditCell({ ...maintainer, isMaintainer: false, block: { createdByUserUuid: me } }),
      ).toBe(false);
    });
  });

  // ═══ Roles combined: the union of the rules ═══

  describe("maintainer who is also another role", () => {
    const me = "user-me";
    const someoneElse = "user-other";

    it("admin + maintainer keeps admin rights over someone else's note", () => {
      expect(
        canEditCell({
          isAdmin: true,
          isAccountManager: false,
          isMaintainer: true,
          accountManagerZoneIds: [],
          currentUserUuid: me,
          bleacherUuid: "b-1",
          bleacher: otherBleacher,
          block: { createdByUserUuid: someoneElse },
        }),
      ).toBe(true);
    });

    it("AM + maintainer edits a note in their zone even if someone else wrote it", () => {
      expect(
        canEditCell({
          isAdmin: false,
          isAccountManager: true,
          isMaintainer: true,
          accountManagerZoneIds: [zoneA],
          currentUserUuid: me,
          bleacherUuid: "b-1",
          bleacher: ownBleacher,
          block: { createdByUserUuid: someoneElse },
        }),
      ).toBe(true);
    });

    it("AM + maintainer edits their own note outside their zone", () => {
      expect(
        canEditCell({
          isAdmin: false,
          isAccountManager: true,
          isMaintainer: true,
          accountManagerZoneIds: [zoneA],
          currentUserUuid: me,
          bleacherUuid: "b-1",
          bleacher: otherBleacher,
          block: { createdByUserUuid: me },
        }),
      ).toBe(true);
    });

    it("AM + maintainer cannot edit someone else's note outside their zone", () => {
      expect(
        canEditCell({
          isAdmin: false,
          isAccountManager: true,
          isMaintainer: true,
          accountManagerZoneIds: [zoneA],
          currentUserUuid: me,
          bleacherUuid: "b-1",
          bleacher: otherBleacher,
          block: { createdByUserUuid: someoneElse },
        }),
      ).toBe(false);
    });

    it("an AM who is not a maintainer is unchanged by the new params", () => {
      expect(
        canEditCell({
          isAdmin: false,
          isAccountManager: true,
          accountManagerZoneIds: [zoneA],
          bleacherUuid: "b-1",
          bleacher: otherBleacher,
          block: { createdByUserUuid: me },
          currentUserUuid: me,
        }),
      ).toBe(false);
    });
  });
});
