import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DateTime } from "luxon";

// docs/specs/accountant-kpi.md §2.4 and §5 (D12, D13): the KPI tab's range lives in `kfrom` and
// `kto`; a URL with neither opens on This month and writes it once; every change is a replace.

const router = { replace: vi.fn() };
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/accountant",
  useSearchParams: () => new URLSearchParams(search),
}));
// The opening write is an effect; it must run in a static render.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useEffect: (f: () => void) => f(),
}));

import { openingRange } from "@/features/accountantAudit/utils/auditRange";
import { useKpiRange } from "./useKpiRange";

let seen: ReturnType<typeof useKpiRange> | null = null;
function Probe() {
  seen = useKpiRange();
  return null;
}
const render = () => renderToStaticMarkup(<Probe />);

const replacedUrl = (n = 0) => {
  const url = new URL(router.replace.mock.calls[n][0] as string, "http://localhost");
  return { pathname: url.pathname, params: url.searchParams };
};

beforeEach(() => {
  router.replace.mockReset();
  search = "tab=kpi&kfrom=2026-11-01&kto=2026-11-30";
  seen = null;
});

describe("reading the URL", () => {
  it("gives the range of kfrom and kto and writes nothing", () => {
    render();
    expect(seen!.range).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(seen!.isInverted).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("does not read the Audit tab's from and to", () => {
    search = "tab=kpi&kfrom=2026-11-01&kto=2026-11-30&from=2026-01-01&to=2026-01-31";
    render();
    expect(seen!.range).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("kfrom= and kto= present but empty is All time and is left alone (D12)", () => {
    search = "tab=kpi&kfrom=&kto=";
    render();
    expect(seen!.range).toEqual({ from: null, to: null });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("one end alone: the other has no limit and nothing is written", () => {
    search = "tab=kpi&kfrom=2026-11-01";
    render();
    expect(seen!.range).toEqual({ from: "2026-11-01", to: null });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("flags From after To", () => {
    search = "tab=kpi&kfrom=2026-11-30&kto=2026-11-01";
    render();
    expect(seen!.isInverted).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("the opening range (D13)", () => {
  it("a URL with neither parameter opens on This month and writes it once, by replace", () => {
    search = "tab=kpi";
    render();
    const expected = openingRange(DateTime.now());
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const { pathname, params } = replacedUrl();
    expect(pathname).toBe("/accountant");
    expect(params.get("kfrom")).toBe(expected.from);
    expect(params.get("kto")).toBe(expected.to);
    expect(params.get("tab")).toBe("kpi");
    // And the tab already shows that range, before the URL catches up.
    expect(seen!.range).toEqual(expected);
  });

  it("is a whole calendar month", () => {
    const { from, to } = openingRange(DateTime.now());
    expect(from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(DateTime.fromISO(to!).plus({ days: 1 }).day).toBe(1);
  });

  it("does not touch the Audit tab's range in the URL", () => {
    search = "tab=kpi&from=2026-01-01&to=2026-01-31";
    render();
    const { params } = replacedUrl();
    expect(params.get("from")).toBe("2026-01-01");
    expect(params.get("to")).toBe("2026-01-31");
    expect(params.has("kfrom")).toBe(true);
  });
});

describe("a change of the range", () => {
  it("is written by replace and keeps every other parameter", () => {
    search = "tab=kpi&kfrom=2026-11-01&kto=2026-11-30&from=2026-01-01&to=2026-01-31&apage=2";
    render();
    seen!.setRange({ from: "2026-10-01", to: null });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace.mock.calls[0][1]).toEqual({ scroll: false });
    const { params } = replacedUrl();
    expect(params.get("kfrom")).toBe("2026-10-01");
    expect(params.get("kto")).toBe(""); // present but empty: no limit
    expect(params.get("from")).toBe("2026-01-01");
    expect(params.get("to")).toBe("2026-01-31");
    expect(params.get("apage")).toBe("2");
    expect(params.get("tab")).toBe("kpi");
  });

  it("choosing All time writes kfrom=&kto=", () => {
    render();
    seen!.setRange({ from: null, to: null });
    const { params } = replacedUrl();
    expect(params.get("kfrom")).toBe("");
    expect(params.get("kto")).toBe("");
    expect(params.has("kfrom")).toBe(true);
  });
});
