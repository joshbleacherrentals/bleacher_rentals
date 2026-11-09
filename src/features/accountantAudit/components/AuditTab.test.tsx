import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-audit-05-drivers-table.md §2.3, §4 (D4, D12, D13, R8, R11, R14, R20) over
// accountant-audit-01-tab.md §3: the tab shows the drivers list, or the page of one driver, and
// owns the range, the driver in the URL and the removal of an unknown driver.

const router = { replace: vi.fn() };
let search = "";
let info: any = null;
let infoLoading = false;
let listProps: any = null;
let pageProps: any = null;
const infoCalls: unknown[][] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/accountant",
  useSearchParams: () => new URLSearchParams(search),
}));
// The effects (the opening write, the unknown driver) must run in a static render.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: (f: () => void) => f(),
}));
vi.mock("../hooks/useAuditDriverInfo", () => ({
  useAuditDriverInfo: (...args: unknown[]) => {
    infoCalls.push(args);
    return { info, isLoading: infoLoading };
  },
}));
vi.mock("./AuditDriversList", () => ({
  AuditDriversList: (p: any) => {
    listProps = p;
    return <div data-testid="list" />;
  },
}));
vi.mock("./AuditDriverPage", () => ({
  AuditDriverPage: (p: any) => {
    pageProps = p;
    return <div data-testid="driver-page" data-driver={p.driver} />;
  },
}));

import { openingRange } from "../utils/auditRange";
import { DateTime } from "luxon";
import { AuditTab } from "./AuditTab";

const INFO = {
  address: null,
  phone: null,
  email: null,
  firstName: "Ann",
  lastName: "Lee",
  isInactive: false,
};

const replacedUrl = (n = 0) => {
  const url = new URL(router.replace.mock.calls[n][0] as string, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

beforeEach(() => {
  router.replace.mockReset();
  search = "tab=audit&from=2026-11-01&to=2026-11-30";
  info = null;
  infoLoading = false;
  listProps = null;
  pageProps = null;
  infoCalls.length = 0;
});

describe("which view", () => {
  it("shows the drivers list when there is no driver, and not the driver page", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-testid="audit-tab"');
    expect(html).toContain('data-testid="list"');
    expect(html).not.toContain('data-testid="driver-page"');
    expect(html).not.toContain("Choose a driver");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows the driver page when there is a known driver, and not the list", () => {
    search += "&driver=d1";
    info = INFO;
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-testid="driver-page"');
    expect(html).toContain('data-driver="d1"');
    expect(html).not.toContain('data-testid="list"');
    expect(pageProps.info).toEqual(INFO);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("asks for the driver's details only for the driver in the URL", () => {
    renderToStaticMarkup(<AuditTab />);
    expect(infoCalls.at(-1)).toEqual([null]);
    search += "&driver=d1";
    info = INFO;
    renderToStaticMarkup(<AuditTab />);
    expect(infoCalls.at(-1)).toEqual(["d1"]);
  });

  it("keeps the driver page while the details load, with no details yet", () => {
    search += "&driver=d1";
    infoLoading = true;
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-testid="driver-page"');
    expect(pageProps.info).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("an unknown driver (R14)", () => {
  beforeEach(() => {
    search = "tab=audit&from=2026-11-01&to=2026-11-30&driver=ghost&asearch=ann&apage=2";
  });

  it("is removed from the URL once the details have settled with no row, keeping the rest", () => {
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const { pathname, params } = replacedUrl();
    expect(pathname).toBe("/accountant");
    expect(params.has("driver")).toBe(false);
    expect(params.has("apage")).toBe(false);
    expect(params.get("asearch")).toBe("ann");
    expect(params.get("from")).toBe("2026-11-01");
    expect(params.get("tab")).toBe("audit");
  });

  it("shows the list, not the driver page", () => {
    const html = renderToStaticMarkup(<AuditTab />);
    expect(html).toContain('data-testid="list"');
    expect(html).not.toContain('data-testid="driver-page"');
  });

  it("is kept while the details are still loading", () => {
    infoLoading = true;
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("the range (D4, D12, D13, R8, R11)", () => {
  it("reads the dates from the URL and gives them to the list", () => {
    renderToStaticMarkup(<AuditTab />);
    expect(listProps.range).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(listProps.isInverted).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("gives the same range to the driver page", () => {
    search += "&driver=d1";
    info = INFO;
    renderToStaticMarkup(<AuditTab />);
    expect(pageProps.range).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("writes the opening range once when the URL has no range parameter (D4)", () => {
    search = "tab=audit";
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const { pathname, params } = replacedUrl();
    const expected = openingRange(DateTime.now());
    expect(pathname).toBe("/accountant");
    expect(params.get("from")).toBe(expected.from);
    expect(params.get("to")).toBe(expected.to);
    expect(params.get("tab")).toBe("audit");
    // And the list already shows that range, before the URL catches up.
    expect(listProps.range).toEqual(expected);
  });

  it("writes it for a driver link with no dates too, keeping the driver (D13)", () => {
    search = "tab=audit&driver=cc4a22ba-80dc-44c9-bbd8-c40b406c2c0c";
    info = INFO;
    renderToStaticMarkup(<AuditTab />);
    const { params } = replacedUrl();
    expect(params.get("driver")).toBe("cc4a22ba-80dc-44c9-bbd8-c40b406c2c0c");
    expect(params.get("from")).toBe(openingRange(DateTime.now()).from);
  });

  it("does not write when from= and to= are present but empty: that is All time (D12)", () => {
    search = "tab=audit&from=&to=";
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).not.toHaveBeenCalled();
    expect(listProps.range).toEqual({ from: null, to: null });
  });

  it("does not write when only one end is in the URL; the other has no limit", () => {
    search = "tab=audit&from=2026-11-01";
    renderToStaticMarkup(<AuditTab />);
    expect(router.replace).not.toHaveBeenCalled();
    expect(listProps.range).toEqual({ from: "2026-11-01", to: null });
  });

  it("flags From after To, for both views", () => {
    search = "tab=audit&from=2026-11-30&to=2026-11-01";
    renderToStaticMarkup(<AuditTab />);
    expect(listProps.isInverted).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("a change of the range is written by replace, drops apage, keeps the rest", () => {
    search = "tab=audit&from=2026-11-01&to=2026-11-30&driver=d1&apage=3&asearch=ann";
    info = INFO;
    renderToStaticMarkup(<AuditTab />);
    pageProps.onRangeChange({ from: "2026-10-01", to: null });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const { params } = replacedUrl();
    expect(params.get("from")).toBe("2026-10-01");
    expect(params.get("to")).toBe(""); // present but empty: no limit
    expect(params.has("apage")).toBe(false);
    expect(params.get("driver")).toBe("d1");
    expect(params.get("asearch")).toBe("ann");
  });

  it("choosing All time writes from=&to=", () => {
    renderToStaticMarkup(<AuditTab />);
    listProps.onRangeChange({ from: null, to: null });
    const { params } = replacedUrl();
    expect(params.get("from")).toBe("");
    expect(params.get("to")).toBe("");
    expect(params.has("from")).toBe(true);
  });
});
