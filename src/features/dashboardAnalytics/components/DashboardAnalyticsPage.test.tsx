import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardAnalyticsPage from "./DashboardAnalyticsPage";
import { repair } from "../utils/analyticsFixture";
import { fleetInputs } from "../utils/analyticsPageFixture";
import type { AnalyticsInputs } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.1 and §6. The page glues the hooks to the body: it
// reads the data, the day in the app time zone and the rates, and it starts on the current year.
// The hooks are replaced by stand-ins; `buildAnalytics` is the real one. What the body draws for
// each period and state is tested in AnalyticsPageContent.test.tsx.

const mocks = vi.hoisted(() => ({
  data: { inputs: undefined as unknown, isLoading: false },
  rates: { status: "idle", rateFor: () => null } as {
    status: string;
    rateFor: (day: string) => number | null;
  },
  ratesCalls: [] as unknown[],
  timezone: "America/Toronto",
}));

vi.mock("../hooks/useAnalyticsData", () => ({
  useAnalyticsData: () => mocks.data,
}));
vi.mock("../hooks/useCadUsdRates", () => ({
  useCadUsdRates: (params: unknown) => {
    mocks.ratesCalls.push(params);
    return mocks.rates;
  },
}));
vi.mock("@/lib/useTimezoneStore", () => ({
  useTimezoneStore: (selector: (state: { timezone: string }) => unknown) =>
    selector({ timezone: mocks.timezone }),
}));

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function testIdText(markup: string, id: string): string {
  const start = markup.indexOf(`data-testid="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const open = markup.indexOf(">", start);
  return markup.slice(open + 1, markup.indexOf("</", open));
}

function setup(over: { inputs?: AnalyticsInputs; isLoading?: boolean; status?: string } = {}) {
  mocks.data = { inputs: over.inputs ?? fleetInputs(), isLoading: over.isLoading ?? false };
  mocks.rates = { status: over.status ?? "idle", rateFor: () => null };
  mocks.ratesCalls = [];
  return renderToStaticMarkup(<DashboardAnalyticsPage />);
}

describe("DashboardAnalyticsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T15:00:00Z"));
    mocks.timezone = "America/Toronto";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has the title and the line under it", () => {
    const markup = setup();
    expect(markup).toMatch(/<h1[^>]*>Dashboard &amp; Analytics<\/h1>/);
    expect(text(markup)).toContain(
      "Maintenance spend, readiness and cost breakdowns across the bleachers",
    );
  });

  it("has the period dropdown as a button named Period, on the current year", () => {
    const markup = setup();
    const button = markup.slice(markup.indexOf("<button"), markup.indexOf("</button>"));
    expect(button).toContain('aria-label="Period"');
    expect(text(button)).toBe("2026");
  });

  it("starts on the current year: the cards are those of 2026", () => {
    const markup = setup();
    expect(testIdText(markup, "card-total-value")).toBe("$6,125.00");
    expect(testIdText(markup, "card-total-note")).toBe("2026 spend across 144 bleachers");
  });

  it("takes the current year from the day in the app time zone, not from UTC", () => {
    // 03:30 UTC on 1 January 2027 is still 31 December 2026 in Toronto.
    vi.setSystemTime(new Date("2027-01-01T03:30:00Z"));
    const markup = setup();
    const button = markup.slice(markup.indexOf("<button"), markup.indexOf("</button>"));
    expect(text(button)).toBe("2026");
  });

  it("starts on a year with no repair when it is the current year", () => {
    vi.setSystemTime(new Date("2027-03-01T15:00:00Z"));
    const markup = setup();
    const button = markup.slice(markup.indexOf("<button"), markup.indexOf("</button>"));
    expect(text(button)).toBe("2027");
    expect(testIdText(markup, "card-total-note")).toBe("2027 spend across 144 bleachers");
    expect(testIdText(markup, "card-open-note")).toBe("No open repairs");
  });

  it("asks the rates hook for the oldest CAD day and today in the app time zone", () => {
    const inputs = fleetInputs({
      repairs: [
        ...fleetInputs().repairs,
        repair({ id: "c1", eventStart: "2026-04-01", currency: "CAD" }),
        repair({ id: "c2", eventStart: "2025-12-30", currency: "CAD" }),
      ],
    });
    vi.setSystemTime(new Date("2026-11-27T03:30:00Z"));
    setup({ inputs });
    expect(mocks.ratesCalls[0]).toEqual({ oldestCadDay: "2025-12-30", today: "2026-11-26" });
  });

  it("asks with no CAD day when there is no CAD repair", () => {
    setup();
    expect(mocks.ratesCalls[0]).toEqual({ oldestCadDay: null, today: "2026-11-26" });
  });

  it("shows the loading state while the local queries are loading", () => {
    const markup = setup({ isLoading: true });
    expect(markup).toContain('aria-busy="true"');
    expect(text(markup)).toContain("Reading repairs and exchange rates");
    expect(markup).not.toContain('data-testid="card-total"');
  });

  it("shows the loading state while the rates are loading", () => {
    const markup = setup({ status: "loading" });
    expect(markup).toContain('aria-busy="true"');
  });

  it("shows the numbers at once when the rates are ready", () => {
    const markup = setup({ status: "ready" });
    expect(markup).not.toContain('aria-busy="true"');
    expect(testIdText(markup, "card-total-value")).toBe("$6,125.00");
  });

  it("shows the page when the rates are unavailable", () => {
    const markup = setup({ status: "unavailable" });
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).toContain('data-testid="zones-block"');
  });

  it("has the four tables and the chart block", () => {
    const markup = setup();
    for (const id of [
      "zones-block",
      "models-block",
      "categories-block",
      "chart-block",
      "vendors-block",
    ]) {
      expect(markup, id).toContain(`data-testid="${id}"`);
    }
  });
});
