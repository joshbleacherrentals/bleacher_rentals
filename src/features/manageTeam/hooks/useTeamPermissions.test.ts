import { describe, it, expect } from "vitest";
import {
  getEditAccess,
  getEditCapabilities,
  toTeamPermissions,
  TeamPermissions,
} from "./useTeamPermissions";

const adminPermissions: TeamPermissions = {
  isAdmin: true,
  isAccountManager: false,
  isAccountant: false,
  canOpenAnyProfile: true,
  isMaintainer: false,
  userId: "admin-user-1",
  accountManagerId: null,
  canCreateUser: true,
};

const amPermissions: TeamPermissions = {
  isAdmin: false,
  isAccountManager: true,
  isAccountant: false,
  canOpenAnyProfile: true,
  isMaintainer: false,
  userId: "am-user-1",
  accountManagerId: "am-id-1",
  canCreateUser: true,
};

const viewerPermissions: TeamPermissions = {
  isAdmin: false,
  isAccountManager: false,
  isAccountant: false,
  canOpenAnyProfile: true,
  isMaintainer: false,
  userId: "viewer-user-1",
  accountManagerId: null,
  canCreateUser: false,
};

// docs/specs/accountant-team.md: an accountant, and a person who is both account manager and
// accountant.
const accountantPermissions: TeamPermissions = {
  isAdmin: false,
  isAccountManager: false,
  isAccountant: true,
  canOpenAnyProfile: false,
  isMaintainer: false,
  userId: "acct-user-1",
  accountManagerId: null,
  canCreateUser: false,
};

const amAccountantPermissions: TeamPermissions = {
  isAdmin: false,
  isAccountManager: true,
  isAccountant: true,
  canOpenAnyProfile: true,
  isMaintainer: false,
  userId: "am-acct-user-1",
  accountManagerId: "am-id-2",
  canCreateUser: true,
};

const amZones = ["zone-a", "zone-b"];

describe("getEditAccess", () => {
  // --- Admin ---
  it("admin: full access to any user", () => {
    expect(
      getEditAccess(
        adminPermissions,
        "some-user",
        {
          isDriver: false,
          accountManagerUuid: null,
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("full");
  });

  it("admin: full access to driver assigned to other AM", () => {
    expect(
      getEditAccess(
        adminPermissions,
        "driver-user",
        {
          isDriver: true,
          accountManagerUuid: "other-am-id",
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("full");
  });

  // --- Account Manager: own profile ---
  it("AM: full access to own profile", () => {
    expect(
      getEditAccess(
        amPermissions,
        "am-user-1",
        {
          isDriver: false,
          accountManagerUuid: null,
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("full");
  });

  // --- Account Manager: driver sharing one of their zones → full edit ---
  it("AM: full access to driver in a shared zone", () => {
    expect(
      getEditAccess(
        amPermissions,
        "driver-user-zone",
        {
          isDriver: true,
          accountManagerUuid: "other-am-id",
          assignedDriverZoneUuids: ["zone-a"],
        },
        amZones,
      ),
    ).toBe("full");
  });

  // --- Account Manager: driver NOT in their zones → zones-only ---
  it("AM: zones-only for a driver assigned to them (legacy) but not in a shared zone", () => {
    expect(
      getEditAccess(
        amPermissions,
        "driver-user-1",
        {
          isDriver: true,
          accountManagerUuid: "am-id-1",
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("zones-only");
  });

  it("AM: zones-only for an unassigned driver not in any of their zones", () => {
    expect(
      getEditAccess(
        amPermissions,
        "driver-user-2",
        {
          isDriver: true,
          accountManagerUuid: null,
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("zones-only");
  });

  it("AM: zones-only for a driver in another AM's zone", () => {
    expect(
      getEditAccess(
        amPermissions,
        "driver-user-3",
        {
          isDriver: true,
          accountManagerUuid: "other-am-id",
          assignedDriverZoneUuids: ["zone-x"],
        },
        amZones,
      ),
    ).toBe("zones-only");
  });

  // --- Account Manager: non-driver users ---
  it("AM: read-only for non-driver user", () => {
    expect(
      getEditAccess(
        amPermissions,
        "some-user",
        {
          isDriver: false,
          accountManagerUuid: null,
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("read-only");
  });

  // --- Account Manager: incomplete users (no roles assigned yet) ---
  it("AM: full access to an incomplete user so they can assign it a role", () => {
    expect(
      getEditAccess(
        amPermissions,
        "incomplete-user",
        {
          isDriver: false,
          accountManagerUuid: null,
          assignedDriverZoneUuids: [],
          hasNoRoles: true,
        },
        amZones,
      ),
    ).toBe("full");
  });

  it("AM: read-only for another AM user", () => {
    expect(
      getEditAccess(
        amPermissions,
        "other-am-user",
        {
          isDriver: false,
          accountManagerUuid: "other-am-id",
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("read-only");
  });

  // --- Viewer ---
  it("viewer: read-only for any user", () => {
    expect(
      getEditAccess(
        viewerPermissions,
        "some-user",
        {
          isDriver: false,
          accountManagerUuid: null,
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("read-only");
  });

  it("viewer: read-only even for unassigned driver", () => {
    expect(
      getEditAccess(
        viewerPermissions,
        "driver-user",
        {
          isDriver: true,
          accountManagerUuid: null,
          assignedDriverZoneUuids: [],
        },
        amZones,
      ),
    ).toBe("read-only");
  });
});

// docs/specs/accountant-team.md §6, D5, D8, D9.
describe("getEditAccess — the accountant", () => {
  const driver = {
    isDriver: true,
    accountManagerUuid: "some-am-id",
    assignedDriverZoneUuids: ["zone-x"],
  };
  const notADriver = {
    isDriver: false,
    accountManagerUuid: null,
    assignedDriverZoneUuids: [],
  };

  it("accountant only: driver-only on a driver (payment info and vendor)", () => {
    expect(getEditAccess(accountantPermissions, "driver-user", driver, [])).toBe("driver-only");
  });

  it("accountant only: driver-only on a driver whatever the zones or the owner", () => {
    for (const target of [
      { isDriver: true, accountManagerUuid: null, assignedDriverZoneUuids: [] },
      { isDriver: true, accountManagerUuid: "am-id-1", assignedDriverZoneUuids: ["zone-a"] },
    ]) {
      expect(getEditAccess(accountantPermissions, "driver-user", target, amZones)).toBe(
        "driver-only",
      );
    }
  });

  it("accountant only: read-only on a user who is not a driver (D5)", () => {
    expect(getEditAccess(accountantPermissions, "some-user", notADriver, [])).toBe("read-only");
  });

  it("accountant only: read-only on an incomplete user — claiming one is for an account manager", () => {
    expect(
      getEditAccess(accountantPermissions, "incomplete", { ...notADriver, hasNoRoles: true }, []),
    ).toBe("read-only");
  });

  it("accountant only: read-only on their own profile when they are not a driver", () => {
    expect(getEditAccess(accountantPermissions, "acct-user-1", notADriver, [])).toBe("read-only");
  });

  it("accountant only: a deactivated account does not change the level (D8)", () => {
    // The inactive status of an account is not an input of getEditAccess at all.
    expect(getEditAccess(accountantPermissions, "inactive-driver", driver, [])).toBe("driver-only");
  });

  it("account manager and accountant: full on a driver in one of their zones", () => {
    expect(
      getEditAccess(
        amAccountantPermissions,
        "driver-user",
        { isDriver: true, accountManagerUuid: "other-am", assignedDriverZoneUuids: ["zone-a"] },
        amZones,
      ),
    ).toBe("full");
  });

  it("account manager and accountant: zones-and-driver on a driver outside their zones (D9)", () => {
    expect(getEditAccess(amAccountantPermissions, "driver-user", driver, amZones)).toBe(
      "zones-and-driver",
    );
  });

  it("account manager and accountant: read-only on a user who is not a driver", () => {
    expect(getEditAccess(amAccountantPermissions, "some-user", notADriver, amZones)).toBe(
      "read-only",
    );
  });

  it("account manager and accountant: full on their own profile and on an incomplete user", () => {
    expect(getEditAccess(amAccountantPermissions, "am-acct-user-1", notADriver, amZones)).toBe(
      "full",
    );
    expect(
      getEditAccess(
        amAccountantPermissions,
        "incomplete",
        { ...notADriver, hasNoRoles: true },
        amZones,
      ),
    ).toBe("full");
  });

  it("admin: full, as ever", () => {
    expect(getEditAccess(adminPermissions, "driver-user", driver, [])).toBe("full");
  });

  it("an account manager who is not an accountant is unchanged: zones-only outside their zones", () => {
    expect(getEditAccess(amPermissions, "driver-user", driver, amZones)).toBe("zones-only");
  });

  it("viewer: still read-only on a driver", () => {
    expect(getEditAccess(viewerPermissions, "driver-user", driver, [])).toBe("read-only");
  });
});

describe("toTeamPermissions", () => {
  const active = (
    roles: Parameters<typeof toTeamPermissions>[0] extends infer A
      ? A extends { status: "active"; roles: infer R }
        ? R
        : never
      : never,
  ) => ({ status: "active", roles, userId: "u1", accountManagerId: null }) as const;

  it("an accountant: isAccountant, may open only drivers, may not create anyone", () => {
    const p = toTeamPermissions(active(["accountant"]));
    expect(p.isAccountant).toBe(true);
    expect(p.isAdmin).toBe(false);
    expect(p.isAccountManager).toBe(false);
    expect(p.canOpenAnyProfile).toBe(false);
    expect(p.canCreateUser).toBe(false);
  });

  it("an admin who is also an accountant is not flagged isAccountant (admin has everything)", () => {
    const p = toTeamPermissions(active(["admin", "accountant"]));
    expect(p.isAccountant).toBe(false);
    expect(p.canOpenAnyProfile).toBe(true);
    expect(p.canCreateUser).toBe(true);
  });

  it("an account manager who is also an accountant keeps both flags and may open any profile", () => {
    const p = toTeamPermissions(active(["account_manager", "accountant"]));
    expect(p.isAccountManager).toBe(true);
    expect(p.isAccountant).toBe(true);
    expect(p.canOpenAnyProfile).toBe(true);
    expect(p.canCreateUser).toBe(true);
  });

  it("a viewer who is also an accountant may open any profile, and may not create anyone", () => {
    const p = toTeamPermissions(active(["viewer", "accountant"]));
    expect(p.isAccountant).toBe(true);
    expect(p.canOpenAnyProfile).toBe(true);
    expect(p.canCreateUser).toBe(false);
  });

  it("a viewer alone may open any profile; an account manager may open any and create", () => {
    expect(toTeamPermissions(active(["viewer"])).canOpenAnyProfile).toBe(true);
    const am = toTeamPermissions(active(["account_manager"]));
    expect(am.canOpenAnyProfile).toBe(true);
    expect(am.canCreateUser).toBe(true);
  });

  it("a user whose access is not active may do nothing", () => {
    for (const access of [
      { status: "loading" },
      { status: "blocked", reason: "no-roles-assigned" },
    ] as const) {
      const p = toTeamPermissions(access);
      expect(p.isAccountant).toBe(false);
      expect(p.canOpenAnyProfile).toBe(false);
      expect(p.canCreateUser).toBe(false);
      expect(p.userId).toBeNull();
    }
  });
});

// docs/specs/accountant-team.md §6: which blocks of the driver page a level leaves editable. The
// form wrapper blocks the pointer for the three partial levels and each block opts back in.
describe("getEditCapabilities", () => {
  it("full: nothing is locked, everything is editable", () => {
    expect(getEditCapabilities("full")).toEqual({
      lockedWithExceptions: false,
      zones: true,
      paymentAndVendor: true,
      driverSetup: true,
    });
  });

  it("zones-only: the zones only (as before this spec)", () => {
    expect(getEditCapabilities("zones-only")).toEqual({
      lockedWithExceptions: true,
      zones: true,
      paymentAndVendor: false,
      driverSetup: false,
    });
  });

  it("driver-only: payment info and vendor, not the zones, not Driver Setup", () => {
    expect(getEditCapabilities("driver-only")).toEqual({
      lockedWithExceptions: true,
      zones: false,
      paymentAndVendor: true,
      driverSetup: false,
    });
  });

  it("zones-and-driver: the zones and payment info and vendor, not Driver Setup (D9)", () => {
    expect(getEditCapabilities("zones-and-driver")).toEqual({
      lockedWithExceptions: true,
      zones: true,
      paymentAndVendor: true,
      driverSetup: false,
    });
  });

  it("read-only: nothing is editable, and the form's own read-only lock does the locking", () => {
    expect(getEditCapabilities("read-only")).toEqual({
      lockedWithExceptions: false,
      zones: false,
      paymentAndVendor: false,
      driverSetup: false,
    });
  });
});
