import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/qbo-invoice-11-counts-and-marks.md §4 (the sidebar) and §8. The shell is rendered
// on the server with its data hooks replaced; `useInvoiceAlerts` runs for real over a stubbed local
// query and permissions store, so what is under test includes who it is built for.

const mocks = vi.hoisted(() => ({
  roles: ["accountant"] as string[],
  rows: [] as unknown[],
  trackers: 0,
  permissions: {
    current: {
      roles: ["accountant"] as string[],
      userId: "user-7",
      leadZoneIds: [] as string[],
      accountManagerZoneIds: [] as string[],
    },
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/features/userAccess/client", () => ({
  useUserAccess: () => ({ status: "active", roles: mocks.roles }),
}));
vi.mock("@/features/changelog/hooks/useHasUnreadChangelog", () => ({
  useHasUnreadChangelog: () => false,
}));
vi.mock("@/features/annualInspections/db/annualInspections", () => ({
  useUnseenInspectionCount: () => 0,
}));
vi.mock("@/features/workTrackers/db/attentionTrackers", () => ({
  useAttentionCount: () => mocks.trackers,
}));
vi.mock("@/components/providers/SystemProvider", async () => {
  const { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } =
    await import("kysely");
  return {
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new SqliteIntrospector(kysely),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
  };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: () => ({ data: mocks.rows, isLoading: false, error: undefined }),
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (selector: (state: typeof mocks.permissions.current) => unknown) =>
    selector(mocks.permissions.current),
}));

import SideBar from "./Sidebar";

const flagged = (id: string, reasons = '["dates"]') => ({
  id,
  qbo_invoice_id: `inv-${id}`,
  qbo_invoice_mismatch: 1,
  qbo_invoice_mismatch_reasons: reasons,
});

/** Signs in with these roles: the sidebar's items and the capability both follow them. */
const signInAs = (...roles: string[]) => {
  mocks.roles = roles;
  mocks.permissions.current = { ...mocks.permissions.current, roles };
};

const BADGE = "sidebar-invoice-attention-badge";

/** The markup of the sidebar's link to `href`, or undefined when the role has no such item. */
const linkTo = (html: string, href: string) =>
  html
    .split("<a ")
    .slice(1)
    .map((anchor) => anchor.split("</a>")[0])
    .find((anchor) => anchor.includes(`href="${href}"`));

const draw = () => renderToStaticMarkup(<SideBar />);

describe("Sidebar: the QuickBooks invoice count", () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.trackers = 0;
    signInAs("accountant");
  });

  it("puts the count on the Accountant item, with its label, and none on Quotes & Bookings", () => {
    mocks.rows = [flagged("a"), flagged("b", '["totals"]'), flagged("c")];

    const html = draw();

    const link = linkTo(html, "/accountant");
    expect(link).toBeDefined();
    expect(link).toContain(`data-testid="${BADGE}"`);
    expect(link).toContain('aria-label="3 QuickBooks invoices need your attention"');
    expect(link).toMatch(/>3<\/span>/);
    expect(linkTo(html, "/quotes-bookings")).toBeDefined();
    expect(linkTo(html, "/quotes-bookings")).not.toContain(BADGE);
    expect(html.match(new RegExp(`data-testid="${BADGE}"`, "g"))).toHaveLength(1);
  });

  it("draws the count in red, the tone of the Work Trackers count", () => {
    mocks.rows = [flagged("a")];

    expect(linkTo(draw(), "/accountant")).toContain("bg-red-600");
  });

  it("is absent at 0: no badge on either item", () => {
    const html = draw();

    expect(html).not.toContain(BADGE);
    expect(linkTo(html, "/accountant")).toBeDefined();
  });

  it("counts an event once and leaves out one the rule says needs nothing", () => {
    mocks.rows = [flagged("a"), flagged("a"), { ...flagged("b"), qbo_invoice_mismatch: 0 }];

    expect(linkTo(draw(), "/accountant")).toContain('aria-label="1 QuickBooks invoices');
  });

  it("is absent for a user who is not an accountant, even for an admin with rows to show", () => {
    mocks.rows = [flagged("a"), flagged("b")];

    for (const roles of [["admin"], ["account_manager"], ["viewer"], ["admin", "viewer"]]) {
      signInAs(...roles);
      const html = draw();
      expect(html, roles.join("+")).not.toContain(BADGE);
      expect(linkTo(html, "/quotes-bookings"), roles.join("+")).toBeDefined();
    }
  });

  it("is drawn for an admin who is also an accountant", () => {
    mocks.rows = [flagged("a"), flagged("b")];
    signInAs("admin", "accountant");

    const html = draw();

    expect(linkTo(html, "/accountant")).toContain('aria-label="2 QuickBooks invoices');
    expect(linkTo(html, "/quotes-bookings")).not.toContain(BADGE);
  });

  it("is on no other item, and sits beside the Work Trackers count without replacing it", () => {
    mocks.rows = [flagged("a")];
    mocks.trackers = 4;

    const html = draw();

    expect(html.match(new RegExp(`data-testid="${BADGE}"`, "g"))).toHaveLength(1);
    expect(linkTo(html, "/work-trackers")).toContain('data-testid="sidebar-attention-badge"');
    expect(linkTo(html, "/work-trackers")).not.toContain(BADGE);
    expect(linkTo(html, "/accountant")).not.toContain("sidebar-attention-badge");
  });
});
