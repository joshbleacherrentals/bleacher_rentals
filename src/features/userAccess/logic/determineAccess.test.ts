import { describe, it, expect } from "vitest";
import { determineUserAccess } from "./determineAccess";
import type { UserAccessData } from "../types";
import { STATUSES } from "@/features/manageTeam/constants";

describe("determineUserAccess", () => {
  // --- Blocked states ---

  it("blocked: cannot-find-account when user data is null", () => {
    const result = determineUserAccess(null);
    expect(result).toEqual({ status: "blocked", reason: "cannot-find-account" });
  });

  it("blocked: account-deactivated regardless of roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.inactive,
      is_admin: 1,
      is_viewer: 1,
      account_manager_id: "am-1",
      driver_id: "d-1",
      developer_id: "dev-1",
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({ status: "blocked", reason: "account-deactivated" });
  });

  it("blocked: driver-only when only driver role", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: "d-1",
      developer_id: null,
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({ status: "blocked", reason: "driver-only" });
  });

  it("blocked: no-roles-assigned when no roles at all", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: null,
      developer_id: null,
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({ status: "blocked", reason: "no-roles-assigned" });
  });

  // --- Single roles ---

  it("active: admin only", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 1,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: null,
      developer_id: null,
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["admin"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: account_manager only", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: "am-1",
      driver_id: null,
      developer_id: null,
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["account_manager"],
      userId: "1",
      accountManagerId: "am-1",
    });
  });

  it("active: developer only", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: null,
      developer_id: "dev-1",
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["developer"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: viewer only", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 1,
      account_manager_id: null,
      driver_id: null,
      developer_id: null,
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["viewer"],
      userId: "1",
      accountManagerId: null,
    });
  });

  // --- Combined roles ---

  it("active: admin + developer → both roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 1,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: null,
      developer_id: "dev-1",
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["admin", "developer"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: account manager + developer → both roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: "am-1",
      driver_id: null,
      developer_id: "dev-1",
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["account_manager", "developer"],
      userId: "1",
      accountManagerId: "am-1",
    });
  });

  it("active: developer + viewer → both roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 1,
      account_manager_id: null,
      driver_id: null,
      developer_id: "dev-1",
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["developer", "viewer"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: driver + viewer → viewer (driver ignored on web)", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 1,
      account_manager_id: null,
      driver_id: "d-1",
      developer_id: null,
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["viewer", "driver"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: driver + developer → both roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: "d-1",
      developer_id: "dev-1",
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["developer", "driver"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: all roles → all roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 1,
      is_viewer: 1,
      account_manager_id: "am-1",
      driver_id: "d-1",
      developer_id: "dev-1",
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["admin", "account_manager", "developer", "viewer", "driver"],
      userId: "1",
      accountManagerId: "am-1",
    });
  });

  // --- Maintainer ---

  it("active: maintainer only — the role must not read as no roles assigned", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: null,
      developer_id: null,
      maintainer_id: "m-1",
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["maintainer"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: admin + maintainer → both roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 1,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: null,
      developer_id: null,
      maintainer_id: "m-1",
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["admin", "maintainer"],
      userId: "1",
      accountManagerId: null,
    });
  });

  it("active: account manager + maintainer → both roles", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: "am-1",
      driver_id: null,
      developer_id: null,
      maintainer_id: "m-1",
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["account_manager", "maintainer"],
      userId: "1",
      accountManagerId: "am-1",
    });
  });

  it("blocked: a deactivated maintainer is still deactivated", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.inactive,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: null,
      developer_id: null,
      maintainer_id: "m-1",
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({ status: "blocked", reason: "account-deactivated" });
  });

  it("blocked: driver-only is unchanged by an absent maintainer row", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: "d-1",
      developer_id: null,
      maintainer_id: null,
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({ status: "blocked", reason: "driver-only" });
  });

  it("active: maintainer + driver → maintainer keeps the web session", () => {
    const userData: UserAccessData = {
      id: "1",
      status_uuid: STATUSES.active,
      is_admin: 0,
      is_viewer: 0,
      account_manager_id: null,
      driver_id: "d-1",
      developer_id: null,
      maintainer_id: "m-1",
    };
    const result = determineUserAccess(userData);
    expect(result).toEqual({
      status: "active",
      roles: ["maintainer", "driver"],
      userId: "1",
      accountManagerId: null,
    });
  });
});
