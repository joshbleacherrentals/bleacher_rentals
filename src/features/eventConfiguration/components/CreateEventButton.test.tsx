import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/dashboard-events-read-only.md §3.1 and §7, and docs/specs/repairs-11-dashboard.md §2.3
// and §7 (D210, D215). The dashboard no longer creates events: "+ New Event" is gone and the toolbar
// is one "+ Create" button whose menu holds "Maintenance Event" (an administrator and a maintainer;
// it opens the New repair window) and "Sub-Rental Request" (an administrator and an account
// manager).
//
// Static markup cannot press the button, so the closed button and the menu's items are drawn
// separately: `CreateMenuItems` is the part the open menu shows. The stores are replaced because a
// server render always reads a zustand store's initial state.

const mocks = vi.hoisted(() => ({
  permissions: { isAdmin: true, isAccountManager: false, isMaintainer: false },
  event: { isFormExpanded: false, isFormMinimized: false },
  subrental: { isFormExpanded: false, isFormMinimized: false },
}));

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: { id: "clerk-1" } }) }));
vi.mock("@/features/dashboard/db/hooks/powersync/usePsUsers", () => ({ usePsUsers: () => [] }));
vi.mock("@/features/manageTeam/hooks/useTeamPermissions", () => ({
  useTeamPermissions: () => mocks.permissions,
}));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));
vi.mock("../state/useCurrentEventStore", () => ({
  useCurrentEventStore: Object.assign(() => mocks.event, { getState: () => mocks.event }),
}));
vi.mock("@/features/subrentals/state/useSubrentalEventStore", () => ({
  useSubrentalEventStore: Object.assign(() => mocks.subrental, {
    getState: () => mocks.subrental,
  }),
}));

import { CreateEventButton, CreateMenuItems, createMenuFor } from "./CreateEventButton";

const asRoles = (roles: Partial<typeof mocks.permissions>) => ({
  isAdmin: false,
  isAccountManager: false,
  isMaintainer: false,
  ...roles,
});

beforeEach(() => {
  mocks.permissions = asRoles({ isAdmin: true });
  mocks.event = { isFormExpanded: false, isFormMinimized: false };
  mocks.subrental = { isFormExpanded: false, isFormMinimized: false };
});

describe("createMenuFor (D210, D215)", () => {
  it("gives an administrator both items", () => {
    expect(createMenuFor(asRoles({ isAdmin: true }))).toEqual({
      maintenance: true,
      subrental: true,
    });
  });

  it("gives an account manager the sub-rental request only", () => {
    expect(createMenuFor(asRoles({ isAccountManager: true }))).toEqual({
      maintenance: false,
      subrental: true,
    });
  });

  it("gives a maintainer the maintenance event only", () => {
    expect(createMenuFor(asRoles({ isMaintainer: true }))).toEqual({
      maintenance: true,
      subrental: false,
    });
  });

  it("gives a viewer nothing", () => {
    expect(createMenuFor(asRoles({}))).toEqual({ maintenance: false, subrental: false });
  });

  it("gives a person with two roles the items of both", () => {
    expect(createMenuFor(asRoles({ isAccountManager: true, isMaintainer: true }))).toEqual({
      maintenance: true,
      subrental: true,
    });
  });
});

describe("CreateEventButton", () => {
  it("draws one + Create button and no New Event", () => {
    const html = renderToStaticMarkup(<CreateEventButton />);

    expect(html).toContain("+ Create");
    expect(html).not.toContain("New Event");
    // One button, not a split one: a single trigger.
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("draws it for an account manager too", () => {
    mocks.permissions = asRoles({ isAccountManager: true });

    expect(renderToStaticMarkup(<CreateEventButton />)).toContain("+ Create");
  });

  it("draws it for a maintainer, who now has the maintenance event (D210)", () => {
    mocks.permissions = asRoles({ isMaintainer: true });

    expect(renderToStaticMarkup(<CreateEventButton />)).toContain("+ Create");
  });

  it("draws nothing for a user who has none of the three roles", () => {
    mocks.permissions = asRoles({});

    expect(renderToStaticMarkup(<CreateEventButton />)).toBe("");
  });

  it("keeps the controls of an open event panel, and does not offer + Create over it", () => {
    mocks.event = { isFormExpanded: true, isFormMinimized: false };

    const html = renderToStaticMarkup(<CreateEventButton />);

    expect(html).not.toContain("+ Create");
    expect(html.match(/<button/g)).toHaveLength(2); // minimise and close
  });

  it("keeps the controls of the sub-rental form, and has no maintenance form any more", () => {
    mocks.subrental = { isFormExpanded: true, isFormMinimized: false };
    const html = renderToStaticMarkup(<CreateEventButton />);

    expect(html).toContain("SUB-RENTAL");
    expect(html).not.toContain("MAINTENANCE");
  });
});

describe("CreateMenuItems", () => {
  const draw = (show: { maintenance: boolean; subrental: boolean }) =>
    renderToStaticMarkup(
      <CreateMenuItems show={show} onMaintenance={() => {}} onSubrental={() => {}} />,
    );

  it("holds the maintenance event and the sub-rental request when both are shown", () => {
    const html = draw({ maintenance: true, subrental: true });

    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain("Maintenance Event");
    expect(html).toContain("Sub-Rental Request");
    expect(html).not.toContain("New Event");
  });

  it("holds only the maintenance event when only it is shown", () => {
    const html = draw({ maintenance: true, subrental: false });

    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Maintenance Event");
    expect(html).not.toContain("Sub-Rental Request");
  });

  it("holds only the sub-rental request when only it is shown", () => {
    const html = draw({ maintenance: false, subrental: true });

    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Sub-Rental Request");
    expect(html).not.toContain("Maintenance Event");
  });
});
