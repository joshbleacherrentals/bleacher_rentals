import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-team.md §6: for an accountant on a driver, the navigation shows the Basic
// User Info and the Driver tabs and nothing that changes roles. Every other level renders as before.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/team/user-1/edit/driver",
  useParams: () => ({ userUuid: "user-1" }),
}));

let permissions = { isAdmin: true, isAccountManager: false } as {
  isAdmin: boolean;
  isAccountManager: boolean;
};
vi.mock("../hooks/useTeamPermissions", () => ({
  useTeamPermissions: () => permissions,
}));

// zustand renders the initial state on the server, whatever `setState` did, so the store is
// replaced by a plain object the tests set.
let storeState = { existingUserUuid: "user-1", roleTabs: [] as string[] };
vi.mock("../state/useCurrentUserStore", () => ({
  useCurrentUserStore: (selector: (s: unknown) => unknown) =>
    selector({ ...storeState, addRoleTab: () => {}, removeRoleTab: () => {} }),
}));

const { default: RoleNavigation } = await import("./RoleNavigation");

function render(editAccess?: Parameters<typeof RoleNavigation>[0]["editAccess"]) {
  return renderToStaticMarkup(<RoleNavigation editAccess={editAccess} />);
}

describe("RoleNavigation", () => {
  beforeEach(() => {
    permissions = { isAdmin: true, isAccountManager: false };
    // A driver who is also an administrator and a viewer: three tabs besides Basic User Info.
    storeState = { existingUserUuid: "user-1", roleTabs: ["administrator", "driver", "viewer"] };
  });

  it("driver-only: shows Basic User Info and Driver, and no other role tab", () => {
    const html = render("driver-only");

    expect(html).toContain("Basic User Info");
    expect(html).toContain(">Driver<");
    expect(html).not.toContain(">Administrator<");
    expect(html).not.toContain(">Viewer<");
  });

  it("driver-only: offers no way to remove a role or to add one", () => {
    const html = render("driver-only");

    expect(html).not.toContain("Remove Driver role");
    expect(html).not.toContain('aria-label="Remove');
    expect(html).not.toContain("+ Add Role");
  });

  it("driver-only: still shows the tab of a driver who has no other roles", () => {
    storeState = { existingUserUuid: "user-1", roleTabs: ["driver"] };

    const html = render("driver-only");

    expect(html).toContain(">Driver<");
    expect(html).not.toContain("+ Add Role");
  });

  it("full (and when no level is given): every tab, a remove button on each, and + Add Role", () => {
    for (const html of [render("full"), render()]) {
      expect(html).toContain(">Administrator<");
      expect(html).toContain(">Driver<");
      expect(html).toContain(">Viewer<");
      expect(html).toContain("Remove Driver role");
      expect(html).toContain("+ Add Role");
    }
  });

  it("zones-only and zones-and-driver: the navigation an account manager has today", () => {
    permissions = { isAdmin: false, isAccountManager: true };

    for (const level of ["zones-only", "zones-and-driver"] as const) {
      const html = render(level);
      expect(html, level).toContain(">Administrator<");
      expect(html, level).toContain("Remove Driver role");
    }
  });
});
