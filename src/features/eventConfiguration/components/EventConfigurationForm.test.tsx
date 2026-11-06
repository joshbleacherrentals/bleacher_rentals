import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/dashboard-events-read-only.md §3.3, §3.5, §3.6 and §7. The event panel and the pop-up
// are a view: no Create / Update / Delete, no banner, Quote goes to the read-only card, and the
// palette is drawn only for someone who may change the colour. The tabs have their own tests; here
// they are bare markers. The store is replaced because a server render reads a zustand store's
// initial state only.

const mocks = vi.hoisted(() => ({
  permissions: {
    isAdmin: true,
    isAccountManager: false,
    userId: "user-1" as string | null,
  },
  store: {
    roles: ["admin"] as string[],
    accountManagerZoneIds: [] as string[],
    leadZoneIds: [] as string[],
  },
  event: {} as Record<string, unknown>,
}));

const freshEvent = () => ({
  eventUuid: "ev-1",
  originalOwnerUserUuid: "user-1",
  bleacherUuids: [] as string[],
  hslHue: null as number | null,
  hueOpen: false,
  alerts: [] as unknown[],
  isModalOpen: false,
  setField: vi.fn(),
  closeModal: vi.fn(),
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/manageTeam/hooks/useTeamPermissions", () => ({
  useTeamPermissions: () => mocks.permissions,
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (select: (s: typeof mocks.store) => unknown) => select(mocks.store),
}));
vi.mock("@/features/dashboard/state/useDashboardBleachersStore", () => ({
  useDashboardBleachersStore: (select: (s: { data: unknown[] }) => unknown) => select({ data: [] }),
}));
vi.mock("../state/useCurrentEventStore", () => ({
  useCurrentEventStore: Object.assign(() => mocks.event, { getState: () => mocks.event }),
}));
vi.mock("../hooks/useEventFormTransportationAlerts", () => ({
  useEventFormTransportationAlerts: () => {},
}));
vi.mock("../hooks/useEventFormAlerts", () => ({ useEventFormAlerts: () => {} }));
vi.mock("../hooks/useBleacherMismatch", () => ({
  useBleacherMismatch: () => ({ hasMismatch: false }),
}));
vi.mock("../functions/saveEventPanelChange", () => ({ commitEventHue: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToastNoThrow: vi.fn() }));
vi.mock("./tabs/CoreTab", () => ({ CoreTab: () => <div data-tab="core" /> }));
vi.mock("./tabs/DetailsTab", () => ({ DetailsTab: () => <div data-tab="details" /> }));
vi.mock("./tabs/AlertsTab", () => ({ AlertsTab: () => <div data-tab="alerts" /> }));

import { EventConfigurationForm } from "./EventConfigurationForm";

const render = (props: Partial<Parameters<typeof EventConfigurationForm>[0]> = {}) =>
  renderToStaticMarkup(<EventConfigurationForm showSetupTeardown={false} {...props} />);

beforeEach(() => {
  mocks.permissions = { isAdmin: true, isAccountManager: false, userId: "user-1" };
  mocks.store = { roles: ["admin"], accountManagerZoneIds: [], leadZoneIds: [] };
  mocks.event = freshEvent();
});

describe("EventConfigurationForm — nothing to save", () => {
  it("has no Create, Update, Delete or Saving button for an admin", () => {
    const html = render();

    expect(html).not.toContain("Create Event");
    expect(html).not.toContain("Update Event");
    expect(html).not.toContain("Delete Event");
    expect(html).not.toContain("Saving");
    expect(html).not.toContain("permanently delete");
  });

  it("has none of them for a viewer either, and no read-only banner", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: false, userId: "user-2" };
    mocks.store = { ...mocks.store, roles: ["viewer"] };
    const html = render();

    expect(html).not.toContain("Create Event");
    expect(html).not.toContain("Update Event");
    expect(html).not.toContain("Delete Event");
    expect(html).not.toContain("read-only access");
  });

  it("keeps the three tabs", () => {
    const html = render();

    expect(html).toContain('data-testid="event-tab-Core"');
    expect(html).toContain('data-testid="event-tab-Details"');
    expect(html).toContain('data-testid="event-tab-Alerts"');
  });

  it("keeps the footer of the pop-up when it is given its two actions", () => {
    const html = render({ onOpenInDashboard: () => {}, onCancel: () => {} });

    expect(html).toContain("Open in Dashboard");
    expect(html).toContain("Cancel");
  });
});

describe("EventConfigurationForm — Quote button", () => {
  const quoteLink = (html: string) => html.match(/<a[^>]*title="Open Quote"[^>]*>/)?.[0] ?? null;

  it.each([
    ["an admin", { isAdmin: true, isAccountManager: false }, ["admin"]],
    ["an account manager", { isAdmin: false, isAccountManager: true }, ["account_manager"]],
    ["a viewer", { isAdmin: false, isAccountManager: false }, ["viewer"]],
  ])("is drawn for %s and goes to the read-only card", (_name, perms, roles) => {
    mocks.permissions = { ...perms, userId: "user-1" };
    mocks.store = { ...mocks.store, roles };

    const link = quoteLink(render());

    expect(link).not.toBeNull();
    expect(link).toContain('href="/quotes-bookings/ev-1"');
    expect(link).not.toContain("/edit");
  });

  it("is drawn for a viewer on an event somebody else owns", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: false, userId: "user-2" };
    mocks.store = { ...mocks.store, roles: ["viewer"] };

    expect(quoteLink(render())).toContain('href="/quotes-bookings/ev-1"');
  });

  it("is not drawn for a maintainer, who has no Quotes & Bookings page", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: false, userId: "user-1" };
    mocks.store = { ...mocks.store, roles: ["maintainer"] };

    expect(quoteLink(render())).toBeNull();
  });

  it("is not drawn while the roles are not known yet", () => {
    mocks.store = { ...mocks.store, roles: [] };

    expect(quoteLink(render())).toBeNull();
  });

  it("is not drawn for a panel that holds no event", () => {
    mocks.event = { ...freshEvent(), eventUuid: null };

    expect(quoteLink(render())).toBeNull();
  });

  it("is drawn for an account manager on an event somebody else owns", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: true, userId: "user-2" };
    mocks.store = { ...mocks.store, roles: ["account_manager"], accountManagerZoneIds: ["z-1"] };

    expect(quoteLink(render())).toContain('href="/quotes-bookings/ev-1"');
  });
});

describe("EventConfigurationForm — colour palette", () => {
  const palette = (html: string) => html.includes('title="Open hue slider"');

  it("is drawn for an admin", () => {
    expect(palette(render())).toBe(true);
  });

  it("is drawn for an account manager on their own event", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: true, userId: "user-1" };
    mocks.store = { ...mocks.store, roles: ["account_manager"], accountManagerZoneIds: ["z-1"] };

    expect(palette(render())).toBe(true);
  });

  it("is not drawn for an account manager on an event somebody else owns", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: true, userId: "user-2" };
    mocks.store = { ...mocks.store, roles: ["account_manager"], accountManagerZoneIds: ["z-1"] };

    expect(palette(render())).toBe(false);
  });

  it("is not drawn for a viewer", () => {
    mocks.permissions = { isAdmin: false, isAccountManager: false, userId: "user-1" };
    mocks.store = { ...mocks.store, roles: ["viewer"] };

    expect(palette(render())).toBe(false);
  });

  it("shows the slider only while it is open, and only to someone who may use it", () => {
    mocks.event = { ...freshEvent(), hueOpen: true, hslHue: 40 };
    expect(render()).toContain('aria-label="Event Hue"');

    mocks.permissions = { isAdmin: false, isAccountManager: false, userId: "user-1" };
    mocks.store = { ...mocks.store, roles: ["viewer"] };
    expect(render()).not.toContain('aria-label="Event Hue"');
  });
});
