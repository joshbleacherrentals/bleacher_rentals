import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-audit-01-tab.md §3 and §5 (the shell: empty state until a driver is
// chosen) and accountant-audit-02-driver-select.md §3 and §5 (the select, the driver in the URL,
// the details block, R6).

const router = { replace: vi.fn() };
let search = "";
let options: any[] = [];
let optionsLoading = false;
let info: any = null;
let infoLoading = false;

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/accountant",
  useSearchParams: () => new URLSearchParams(search),
}));
// The effect of R6 must run in a static render.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: (f: () => void) => f(),
}));
vi.mock("../hooks/useAuditDriverOptions", () => ({
  useAuditDriverOptions: () => ({ options, isLoading: optionsLoading }),
}));
vi.mock("../hooks/useAuditDriverInfo", () => ({
  useAuditDriverInfo: () => ({ info, isLoading: infoLoading }),
}));
vi.mock("./AuditDriverSelect", () => ({
  AuditDriverSelect: (p: any) => <div data-testid="select" data-value={p.value ?? ""} />,
}));

import { AuditTab } from "./AuditTab";

const opt = {
  id: "d1",
  driverUuid: "d1",
  clerkUserId: "c",
  firstName: "A",
  lastName: "B",
  email: "e",
  isInactive: false,
};

beforeEach(() => {
  router.replace.mockReset();
  search = "tab=audit";
  options = [opt];
  optionsLoading = false;
  info = { address: "1 Main St", phone: "555", email: "a@x.com" };
  infoLoading = false;
});

describe("AuditTab with no driver", () => {
  it("shows the select first, then the empty state, and no details block", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-testid="audit-tab"');
    expect(html.indexOf('data-testid="select"')).toBeLessThan(
      html.indexOf('data-testid="audit-empty-state"'),
    );
    expect(html).toContain(">Choose a driver<");
    expect(html).toContain(
      ">Pick a driver above to see all of their work trackers and whether each one has been paid.<",
    );
    expect(html).not.toContain('data-testid="audit-driver-info"');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("draws the truck icon, hidden from assistive technology, and no table", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    const icon = html.match(/<svg[^>]*lucide-truck[^>]*>/)?.[0] ?? "";
    expect(icon).toContain('aria-hidden="true"');
    expect(html).not.toContain("<table");
  });
});

describe("AuditTab with a driver", () => {
  it("shows the select's value and the details block, and not the empty state", () => {
    search = "tab=audit&driver=d1";
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-value="d1"');
    expect(html).toContain('data-testid="audit-driver-info"');
    expect(html).not.toContain('data-testid="audit-empty-state"');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("draws no block while the details load", () => {
    search = "tab=audit&driver=d1";
    infoLoading = true;
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).not.toContain('data-testid="audit-driver-info"');
  });

  it("removes an unknown driver from the URL once the list has loaded", () => {
    search = "tab=audit&driver=ghost";
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).toHaveBeenCalledWith("/accountant?tab=audit", { scroll: false });
  });

  it("keeps the driver while the list is loading", () => {
    search = "tab=audit&driver=d1";
    options = [];
    optionsLoading = true;
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
