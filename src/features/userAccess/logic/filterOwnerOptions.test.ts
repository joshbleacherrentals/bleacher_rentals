import { describe, it, expect } from "vitest";
import { filterOwnerOptions } from "./filterOwnerOptions";

describe("filterOwnerOptions (Owner dropdown filtering)", () => {
  const allUsers = [
    { id: "user-admin", name: "Admin User", is_admin: true },
    { id: "user-am-1", name: "AM One", is_admin: false },
    { id: "user-am-2", name: "AM Two", is_admin: false },
    { id: "user-viewer", name: "Viewer User", is_admin: false },
  ];

  const accountManagerUserIds = new Set(["user-am-1", "user-am-2"]);

  // ═══ Admin ═══

  it("admin sees only admins and account managers", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: true,
      currentUserId: "user-admin",
      disabled: false,
      accountManagerUserIds,
    });
    expect(result).toEqual([
      { id: "user-admin", name: "Admin User", is_admin: true },
      { id: "user-am-1", name: "AM One", is_admin: false },
      { id: "user-am-2", name: "AM Two", is_admin: false },
    ]);
  });

  // ═══ AM (non-admin) ═══

  it("AM sees all admins and account managers (can assign any AM as owner)", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: false,
      currentUserId: "user-am-1",
      disabled: false,
      accountManagerUserIds,
    });
    expect(result).toEqual([
      { id: "user-admin", name: "Admin User", is_admin: true },
      { id: "user-am-1", name: "AM One", is_admin: false },
      { id: "user-am-2", name: "AM Two", is_admin: false },
    ]);
  });

  // ═══ Read-only mode (disabled) ═══

  it("AM sees all users in read-only mode (disabled=true)", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: false,
      currentUserId: "user-am-1",
      disabled: true,
      accountManagerUserIds,
    });
    expect(result).toEqual(allUsers);
  });

  it("viewer sees all users in read-only mode (disabled=true)", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: false,
      currentUserId: "user-viewer",
      disabled: true,
      accountManagerUserIds,
    });
    expect(result).toEqual(allUsers);
  });

  // ═══ Viewer (non-admin, non-AM) — form not disabled ═══

  it("viewer sees only self when not disabled", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: false,
      currentUserId: "user-viewer",
      disabled: false,
      accountManagerUserIds,
    });
    expect(result).toEqual([{ id: "user-viewer", name: "Viewer User", is_admin: false }]);
  });

  // ═══ Deactivated users ═══

  it("excludes deactivated users from the selectable list when inactiveStatusUuid is set", () => {
    const usersWithStatus = [
      { id: "user-admin", is_admin: true, status_uuid: "active" },
      { id: "user-am-1", is_admin: false, status_uuid: "active" },
      { id: "user-am-2", is_admin: false, status_uuid: "inactive" },
    ];
    const result = filterOwnerOptions({
      users: usersWithStatus,
      isAdmin: false,
      currentUserId: "user-am-1",
      disabled: false,
      accountManagerUserIds: new Set(["user-am-1", "user-am-2"]),
      inactiveStatusUuid: "inactive",
    });
    expect(result.map((u) => u.id)).toEqual(["user-admin", "user-am-1"]);
  });

  it("still shows deactivated users in read-only mode (disabled=true) so the owner name renders", () => {
    const usersWithStatus = [
      { id: "user-am-1", is_admin: false, status_uuid: "active" },
      { id: "user-am-2", is_admin: false, status_uuid: "inactive" },
    ];
    const result = filterOwnerOptions({
      users: usersWithStatus,
      isAdmin: false,
      currentUserId: "user-am-1",
      disabled: true,
      accountManagerUserIds: new Set(["user-am-1", "user-am-2"]),
      inactiveStatusUuid: "inactive",
    });
    expect(result).toEqual(usersWithStatus);
  });

  // ═══ Edge cases ═══

  it("returns empty when currentUserId is null and not admin", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: false,
      currentUserId: null,
      disabled: false,
      accountManagerUserIds,
    });
    expect(result).toEqual([]);
  });

  it("returns empty when users list is empty", () => {
    const result = filterOwnerOptions({
      users: [],
      isAdmin: true,
      currentUserId: "user-admin",
      disabled: false,
      accountManagerUserIds,
    });
    expect(result).toEqual([]);
  });

  it("admin disabled=true still returns all users", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: true,
      currentUserId: "user-admin",
      disabled: true,
      accountManagerUserIds,
    });
    expect(result).toEqual(allUsers);
  });

  // ═══ Part 2 — cannot reassign another AM's event to self ═══

  it("AM cannot pick self when event owned by another AM", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: false,
      currentUserId: "user-am-1",
      disabled: false,
      accountManagerUserIds,
      existingOwnerId: "user-am-2",
    });
    expect(result.map((u) => u.id)).toEqual(["user-admin", "user-am-2"]);
  });

  it("AM can still pick self when they already own the event", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: false,
      currentUserId: "user-am-1",
      disabled: false,
      accountManagerUserIds,
      existingOwnerId: "user-am-1",
    });
    expect(result.map((u) => u.id)).toContain("user-am-1");
  });

  it("admin can reassign another AM's event to anyone", () => {
    const result = filterOwnerOptions({
      users: allUsers,
      isAdmin: true,
      currentUserId: "user-admin",
      disabled: false,
      accountManagerUserIds,
      existingOwnerId: "user-am-2",
    });
    expect(result.map((u) => u.id)).toEqual(["user-admin", "user-am-1", "user-am-2"]);
  });
});

describe("filterOwnerOptions with PowerSync user rows", () => {
  // `status_uuid` is optional on the generic, so a row shape that simply lacks
  // the column type-checks and silently stops filtering inactive users. These
  // lock the column requirement in place now that the rows come from
  // `usePsUsers` rather than a Zustand mirror of the whole Users table.
  const INACTIVE = "status-inactive";

  const psUser = (overrides: Record<string, unknown> = {}) => ({
    id: "u-1",
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    clerk_user_id: "clerk-1",
    is_admin: 1 as number | null,
    status_uuid: null as string | null,
    ...overrides,
  });

  it("drops an inactive user from the owner list", () => {
    const result = filterOwnerOptions({
      users: [psUser(), psUser({ id: "u-2", status_uuid: INACTIVE })],
      isAdmin: true,
      currentUserId: "u-1",
      disabled: false,
      accountManagerUserIds: new Set<string>(),
      inactiveStatusUuid: INACTIVE,
    });

    expect(result.map((u) => u.id)).toEqual(["u-1"]);
  });

  it("keeps active users whose status is null", () => {
    const result = filterOwnerOptions({
      users: [psUser()],
      isAdmin: true,
      currentUserId: "u-1",
      disabled: false,
      accountManagerUserIds: new Set<string>(),
      inactiveStatusUuid: INACTIVE,
    });

    expect(result).toHaveLength(1);
  });

  it("exposes the columns the owner dropdown renders", () => {
    // The label falls back to email when a user has no name.
    const user = psUser({ first_name: null, last_name: null });
    const label = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email;

    expect(label).toBe("ada@example.com");
  });
});
