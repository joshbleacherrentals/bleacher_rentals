import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/dashboard-events-read-only.md §3.1 and §7. The dashboard no longer creates events:
// "+ New Event" is gone and the toolbar is one "+ Create" button whose menu holds the maintenance
// event and the sub-rental request.
//
// Static markup cannot press the button, so the closed button and the menu's items are drawn
// separately: `CreateMenuItems` is the part the open menu shows. The stores are replaced because a
// server render always reads a zustand store's initial state.

const mocks = vi.hoisted(() => ({
  permissions: { isAdmin: true, isAccountManager: false },
  event: { isFormExpanded: false, isFormMinimized: false },
  maintenance: { isFormExpanded: false, isFormMinimized: false },
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
vi.mock("@/features/maintenanceEvents/state/useMaintenanceEventStore", () => ({
  useMaintenanceEventStore: Object.assign(() => mocks.maintenance, {
    getState: () => mocks.maintenance,
  }),
}));
vi.mock("@/features/subrentals/state/useSubrentalEventStore", () => ({
  useSubrentalEventStore: Object.assign(() => mocks.subrental, {
    getState: () => mocks.subrental,
  }),
}));

import { CreateEventButton, CreateMenuItems } from "./CreateEventButton";

beforeEach(() => {
  mocks.permissions = { isAdmin: true, isAccountManager: false };
  mocks.event = { isFormExpanded: false, isFormMinimized: false };
  mocks.maintenance = { isFormExpanded: false, isFormMinimized: false };
  mocks.subrental = { isFormExpanded: false, isFormMinimized: false };
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
    mocks.permissions = { isAdmin: false, isAccountManager: true };

    expect(renderToStaticMarkup(<CreateEventButton />)).toContain("+ Create");
  });

  it("draws nothing for a user who is neither admin nor account manager", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: false };

    expect(renderToStaticMarkup(<CreateEventButton />)).toBe("");
  });

  it("keeps the controls of an open event panel, and does not offer + Create over it", () => {
    mocks.event = { isFormExpanded: true, isFormMinimized: false };

    const html = renderToStaticMarkup(<CreateEventButton />);

    expect(html).not.toContain("+ Create");
    expect(html.match(/<button/g)).toHaveLength(2); // minimise and close
  });

  it("keeps the controls of the maintenance and sub-rental forms", () => {
    mocks.maintenance = { isFormExpanded: true, isFormMinimized: false };
    expect(renderToStaticMarkup(<CreateEventButton />)).toContain("MAINTENANCE");

    mocks.maintenance = { isFormExpanded: false, isFormMinimized: false };
    mocks.subrental = { isFormExpanded: true, isFormMinimized: false };
    expect(renderToStaticMarkup(<CreateEventButton />)).toContain("SUB-RENTAL");
  });
});

describe("CreateMenuItems", () => {
  it("holds exactly the maintenance event and the sub-rental request", () => {
    const html = renderToStaticMarkup(
      <CreateMenuItems onMaintenance={() => {}} onSubrental={() => {}} />,
    );

    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain("Maintenance Event");
    expect(html).toContain("Sub-Rental Request");
    expect(html).not.toContain("New Event");
  });
});
