import { describe, it, expect } from "vitest";
import { getEditAccess, TeamPermissions } from "./useTeamPermissions";

const adminPermissions: TeamPermissions = {
  isAdmin: true,
  isAccountManager: false,
  isMaintainer: false,
  userId: "admin-user-1",
  accountManagerId: null,
  canCreateUser: true,
  canAssignAdmin: true,
};

const amPermissions: TeamPermissions = {
  isAdmin: false,
  isAccountManager: true,
  isMaintainer: false,
  userId: "am-user-1",
  accountManagerId: "am-id-1",
  canCreateUser: true,
  canAssignAdmin: false,
};

const viewerPermissions: TeamPermissions = {
  isAdmin: false,
  isAccountManager: false,
  isMaintainer: false,
  userId: "viewer-user-1",
  accountManagerId: null,
  canCreateUser: false,
  canAssignAdmin: false,
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
