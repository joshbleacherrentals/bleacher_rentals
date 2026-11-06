import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/dashboard-events-read-only.md §3.2 and §7. A click on an empty cell no longer offers
// "Create Event"; Work Tracker, Maintenance and Create Sub-Rental stay, for admin and account
// manager only. Everything around the popup is replaced: this only reads what it draws.

const mocks = vi.hoisted(() => ({
  perms: {
    isAdmin: true,
    isAccountManager: false,
    isMaintainer: false,
    accountManagerZoneIds: [] as string[],
    userId: "user-1",
  },
}));

vi.mock("../state/useSelectedBlock", () => ({
  useSelectedBlockStore: () => ({
    isOpen: true,
    key: "",
    blockUuid: null,
    createdByUserUuid: null,
    bleacherUuid: "b-1",
    date: "2026-07-01",
    text: "",
    workTrackerUuid: null,
    setField: vi.fn(),
    resetForm: vi.fn(),
  }),
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: Object.assign(() => mocks.perms, { getState: () => mocks.perms }),
}));
vi.mock("../state/useDashboardBleachersStore", () => ({
  useDashboardBleachersStore: Object.assign(
    (select: (s: { data: unknown[] }) => unknown) => select({ data: [] }),
    { getState: () => ({ data: [] }) },
  ),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({ useClerkSupabaseClient: () => ({}) }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: { id: "clerk-1" } }) }));
vi.mock("@/features/dashboard/db/hooks/powersync/usePsUsers", () => ({ usePsUsers: () => [] }));
vi.mock("@/components/AppTooltip", () => ({
  AppTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../db/client/db", () => ({ deleteBlock: vi.fn(), saveBlock: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: vi.fn() }));
vi.mock("@/app/damage-reports/DamageReportModal", () => ({ DamageReportModal: () => null }));
vi.mock("@/app/damage-reports/_lib/db", () => ({
  useDamageReports: () => ({ reports: [] }),
}));
vi.mock("@/features/workTrackers/util/createWorkTrackerDraft", () => ({
  buildWorkTrackerDraft: vi.fn(),
  checkWorkTrackerOpenAccess: vi.fn(),
}));
vi.mock("@/features/maintenanceEvents/state/useMaintenanceEventStore", () => ({
  useMaintenanceEventStore: { getState: () => ({}) },
}));
vi.mock("@/features/subrentals/state/useSubrentalEventStore", () => ({
  useSubrentalEventStore: { getState: () => ({}) },
}));

import CellEditor from "./CellEditor";

const render = () => renderToStaticMarkup(<CellEditor />);

beforeEach(() => {
  mocks.perms = {
    isAdmin: true,
    isAccountManager: false,
    isMaintainer: false,
    accountManagerZoneIds: [],
    userId: "user-1",
  };
});

describe("CellEditor toolbar", () => {
  it("offers Work Tracker, Maintenance and Create Sub-Rental, and no Create Event, to an admin", () => {
    const html = render();

    expect(html).toContain('aria-label="Work Tracker"');
    expect(html).toContain('aria-label="Maintenance"');
    expect(html).toContain('aria-label="Create Sub-Rental"');
    expect(html).not.toContain("Create Event");
  });

  it("offers the same three to an account manager", () => {
    mocks.perms = { ...mocks.perms, isAdmin: false, isAccountManager: true };
    const html = render();

    expect(html).toContain('aria-label="Work Tracker"');
    expect(html).toContain('aria-label="Maintenance"');
    expect(html).toContain('aria-label="Create Sub-Rental"');
    expect(html).not.toContain("Create Event");
  });

  it("offers none of them to a viewer or maintainer", () => {
    mocks.perms = { ...mocks.perms, isAdmin: false, isAccountManager: false };
    const html = render();

    expect(html).not.toContain('aria-label="Work Tracker"');
    expect(html).not.toContain('aria-label="Maintenance"');
    expect(html).not.toContain('aria-label="Create Sub-Rental"');
    expect(html).not.toContain("Create Event");
  });
});
