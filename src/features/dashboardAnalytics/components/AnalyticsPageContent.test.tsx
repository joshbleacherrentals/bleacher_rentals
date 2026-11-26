import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsPageContent } from "./AnalyticsPageContent";
import { repair } from "../utils/analyticsFixture";
import { fleetBleachers, fleetInputs } from "../utils/analyticsPageFixture";
import { budget } from "../utils/analyticsFixture";
import type { AnalyticsInputs, Period } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2 and §6. The page body is rendered to text with the
// real `buildAnalytics` over the hand-worked fleet of analyticsPageFixture.ts. Clicking is not
// possible in this project's tests (no DOM environment); the period is therefore a prop, and
// choosing one in the real dropdown is covered by e2e S7. The period dropdown is replaced by a
// stand-in that records what it was given (its own test is PeriodDropdown.test.tsx), and the chart
// is Recharts, which draws nothing when rendered to text (its own test is CategorySpendChart.test.tsx).

const captured = vi.hoisted(() => ({
  props: undefined as
    | undefined
    | {
        label: string;
        options: { value: string; label: string; checked: boolean }[];
        onChange: (value: string) => void;
      },
}));

vi.mock("./PeriodDropdown", () => ({
  PeriodDropdown: (props: NonNullable<typeof captured.props>) => {
    captured.props = props;
    return <button aria-label="Period">{props.label}</button>;
  },
}));

const YEAR_2026: Period = { kind: "year", year: 2026 };
const YEAR_2025: Period = { kind: "year", year: 2025 };
const ALL: Period = { kind: "all" };

type Rates = {
  status: "idle" | "loading" | "ready" | "unavailable";
  rateFor: (d: string) => number | null;
};
const NO_RATE: Rates = { status: "unavailable", rateFor: () => null };
const IDLE: Rates = { status: "idle", rateFor: () => null };

function render(
  over: {
    inputs?: AnalyticsInputs;
    isLoading?: boolean;
    rates?: Rates;
    currentYear?: number;
    choice?: Period;
    onChoose?: (period: Period) => void;
  } = {},
) {
  return renderToStaticMarkup(
    <AnalyticsPageContent
      inputs={over.inputs ?? fleetInputs()}
      isLoading={over.isLoading ?? false}
      rates={over.rates ?? IDLE}
      currentYear={over.currentYear ?? 2026}
      choice={over.choice ?? YEAR_2026}
      onChoose={over.onChoose ?? (() => {})}
    />,
  );
}

const decode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");

const text = (markup: string) =>
  decode(
    markup
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

/** The text of the element that carries this test id and holds nothing but text. */
function testIdText(markup: string, id: string): string {
  const start = markup.indexOf(`data-testid="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const open = markup.indexOf(">", start);
  const close = markup.indexOf("</", open);
  return decode(markup.slice(open + 1, close));
}

/** The open tag of the element that carries this test id. */
function tagOf(markup: string, id: string): string {
  const start = markup.indexOf(`data-testid="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const from = markup.lastIndexOf("<", start);
  return markup.slice(from, markup.indexOf(">", start) + 1);
}

/** A block of the page (a `<section>`), from its test id to its closing tag. */
function block(markup: string, id: string): string {
  const start = markup.indexOf(`data-testid="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return markup.slice(start, markup.indexOf("</section>", start));
}

/** The cells of every row of a block, header first and total last. */
function rowsOf(markup: string): string[][] {
  return markup
    .split('role="row"')
    .slice(1)
    .map((chunk) =>
      [...chunk.matchAll(/role="(?:cell|columnheader)"[^>]*>([^<]*)</g)].map((m) => decode(m[1])),
    );
}

const card = (markup: string, name: string) => ({
  value: testIdText(markup, `card-${name}-value`),
  note: testIdText(markup, `card-${name}-note`),
});

const cadRepair = (id: string, eventStart: string) =>
  repair({ id, eventStart, currency: "CAD", costCents: 100000 });

describe("the header", () => {
  it("has the title and the line under it", () => {
    const markup = render();
    expect(markup).toMatch(/<h1[^>]*>Dashboard &amp; Analytics<\/h1>/);
    expect(text(markup)).toContain(
      "Maintenance spend, readiness and cost breakdowns across the bleachers",
    );
  });

  it("hands the period dropdown the label of the period", () => {
    render({ choice: YEAR_2026 });
    expect(captured.props?.label).toBe("2026");
    render({ choice: ALL });
    expect(captured.props?.label).toBe("All time");
  });

  it("keeps the header while the page loads", () => {
    const markup = render({ isLoading: true });
    expect(markup).toMatch(/<h1[^>]*>Dashboard &amp; Analytics<\/h1>/);
    expect(markup).toContain('aria-label="Period"');
  });
});

describe("the period dropdown (D11)", () => {
  beforeEach(() => {
    captured.props = undefined;
  });

  it("lists the years of the repairs newest first, then All time, with the period ticked", () => {
    render({ choice: YEAR_2026 });
    expect(captured.props?.options).toEqual([
      { value: "2026", label: "2026", checked: true },
      { value: "2025", label: "2025", checked: false },
      { value: "2024", label: "2024", checked: false },
      { value: "all", label: "All time", checked: false },
    ]);
  });

  it("ticks All time when the period is All time", () => {
    render({ choice: ALL });
    expect(captured.props?.options.filter((o) => o.checked).map((o) => o.value)).toEqual(["all"]);
  });

  it("always lists the current year, even with no repair in it", () => {
    render({ currentYear: 2027, choice: { kind: "year", year: 2027 } });
    expect(captured.props?.options.map((o) => o.value)).toEqual([
      "2027",
      "2026",
      "2025",
      "2024",
      "all",
    ]);
  });

  it("hands a choice to onChoose as a period", () => {
    const onChoose = vi.fn();
    render({ onChoose });
    captured.props?.onChange("2025");
    captured.props?.onChange("all");
    captured.props?.onChange("nonsense");
    expect(onChoose.mock.calls).toEqual([[{ kind: "year", year: 2025 }], [{ kind: "all" }]]);
  });

  it("moves to the current year when the chosen year has no repair any more", () => {
    const inputs = fleetInputs({
      repairs: fleetInputs().repairs.filter((r) => !r.eventStart.startsWith("2024")),
    });
    const markup = render({ inputs, choice: { kind: "year", year: 2024 } });
    expect(captured.props?.label).toBe("2026");
    expect(card(markup, "total").note).toBe("2026 spend across 144 bleachers");
  });
});

describe("the five cards", () => {
  it("shows the labels in order", () => {
    const content = text(render());
    const labels = [
      "Total Fleet Maintenance Spend",
      "Bleachers Ready",
      "Avg Maint Spend / Bleacher",
      "Active Open Work Orders",
      "Annual Budget Utilization",
    ];
    const places = labels.map((label) => content.indexOf(label));
    expect(places.every((place) => place > -1)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it("Total Fleet Maintenance Spend: the spend with cents and the year", () => {
    expect(card(render(), "total")).toEqual({
      value: "$6,125.00",
      note: "2026 spend across 144 bleachers",
    });
  });

  it("Bleachers Ready: the percent and how many are ready", () => {
    expect(card(render(), "ready")).toEqual({ value: "97.2%", note: "140 of 144 ready to go" });
  });

  it("Avg Maint Spend / Bleacher: the average with cents and the range in whole dollars", () => {
    expect(card(render(), "avg")).toEqual({ value: "$42.53", note: "Range: $0 – $2,325" });
  });

  it("Active Open Work Orders: the count and all five statuses", () => {
    expect(card(render(), "open")).toEqual({
      value: "3",
      note: "Inbound 1 | Triaged 1 | Waiting repair 1 | In repair 0 | Confirm repair 0",
    });
  });

  it("Active Open Work Orders: says there are none when there are none", () => {
    expect(card(render({ choice: YEAR_2025 }), "open")).toEqual({
      value: "0",
      note: "No open repairs",
    });
  });

  it("Annual Budget Utilization: the percent, a bar, the spent and remaining line and the budget", () => {
    const markup = render();
    expect(testIdText(markup, "budget-value")).toBe("50.0%");
    expect(tagOf(markup, "budget-bar-fill")).toContain("width:50.0%");
    expect(testIdText(markup, "budget-line-1")).toBe("Spent: $6,125 | Remaining: $6,125");
    expect(testIdText(markup, "budget-line-2")).toBe("Budget 2026: $12,250");
    expect(markup).not.toContain("Over budget");
  });

  it("follows the period: 2025", () => {
    const markup = render({ choice: YEAR_2025 });
    expect(card(markup, "total")).toEqual({
      value: "$400.00",
      note: "2025 spend across 144 bleachers",
    });
    expect(card(markup, "avg")).toEqual({ value: "$2.78", note: "Range: $0 – $400" });
    expect(testIdText(markup, "budget-value")).toBe("2.0%");
    expect(testIdText(markup, "budget-line-1")).toBe("Spent: $400 | Remaining: $19,600");
    expect(testIdText(markup, "budget-line-2")).toBe("Budget 2025: $20,000");
  });

  it("follows the period: All time says All-time and Budgets of all years", () => {
    const markup = render({ choice: ALL });
    expect(card(markup, "total")).toEqual({
      value: "$6,625.00",
      note: "All-time spend across 144 bleachers",
    });
    expect(testIdText(markup, "budget-value")).toBe("20.5%");
    expect(testIdText(markup, "budget-line-1")).toBe("Spent: $6,625 | Remaining: $25,625");
    expect(testIdText(markup, "budget-line-2")).toBe("Budgets of all years: $32,250");
  });

  it("keeps Bleachers Ready the same for every period (D16)", () => {
    const readies = [YEAR_2026, YEAR_2025, ALL].map((choice) => card(render({ choice }), "ready"));
    expect(readies[0]).toEqual({ value: "97.2%", note: "140 of 144 ready to go" });
    expect(readies[1]).toEqual(readies[0]);
    expect(readies[2]).toEqual(readies[0]);
  });
});

describe("the budget card over the budget (D40, board OverBudget)", () => {
  const over = () => render({ inputs: fleetInputs({ budgets: [budget(2026, 500000)] }) });

  it("shows 122.5%, a negative remaining and the badge Over budget", () => {
    const markup = over();
    expect(testIdText(markup, "budget-value")).toBe("122.5%");
    expect(testIdText(markup, "budget-line-1")).toBe("Spent: $6,125 | Remaining: -$1,125");
    expect(testIdText(markup, "budget-over-badge")).toBe("Over budget");
  });

  it("is red: the value and the spent line #b91c1c, the full bar #dc2626", () => {
    const markup = over();
    expect(tagOf(markup, "budget-value")).toContain("#b91c1c");
    expect(tagOf(markup, "budget-line-1")).toContain("#b91c1c");
    expect(tagOf(markup, "budget-bar-fill")).toContain("#dc2626");
    expect(tagOf(markup, "budget-bar-fill")).toContain("width:100.0%");
  });

  it("is not red when the spend is within the budget", () => {
    const markup = render();
    expect(tagOf(markup, "budget-value")).not.toContain("#b91c1c");
    expect(tagOf(markup, "budget-line-1")).not.toContain("#b91c1c");
    expect(tagOf(markup, "budget-bar-fill")).not.toContain("#dc2626");
  });
});

describe("the budget card with no budget (D18, board NoBudget)", () => {
  const none = (choice: Period) => render({ inputs: fleetInputs({ budgets: [] }), choice });

  it("shows a dash, an empty bar and Budget not set", () => {
    const markup = none(YEAR_2026);
    expect(testIdText(markup, "budget-value")).toBe("—");
    expect(tagOf(markup, "budget-bar-fill")).toContain("width:0%");
    expect(testIdText(markup, "budget-line-1")).toBe("Budget not set");
    expect(testIdText(markup, "budget-line-2")).toBe("No budget is set for 2026");
    expect(markup).not.toContain("Over budget");
  });

  it("says no budget is set for any year on All time", () => {
    expect(testIdText(none(ALL), "budget-line-2")).toBe("No budget is set for any year");
  });

  it("treats a year with a different budget row as not set", () => {
    const markup = render({
      inputs: fleetInputs({ budgets: [budget(2025, 2000000)] }),
      choice: YEAR_2026,
    });
    expect(testIdText(markup, "budget-line-1")).toBe("Budget not set");
  });
});

describe("the zone table (D19)", () => {
  it("has the title, the grey line and the six columns", () => {
    const zones = block(render(), "zones-block");
    const content = text(zones);
    expect(content).toContain("Operating Zone Cost & Fleet Maintenance Cost");
    expect(content).toContain("Repairs with no zone are counted in Unassigned");
    expect(rowsOf(zones)[0]).toEqual([
      "Operating Zone",
      "Assigned Units",
      "Total Work Orders",
      "Total Maintenance Cost",
      "Average Cost / Unit",
      "% of Total Spend",
    ]);
  });

  it("lists every zone, then Unassigned, then the total row", () => {
    expect(rowsOf(block(render(), "zones-block")).slice(1)).toEqual([
      ["Zone 1", "100", "2", "$5,125.00", "$51.25", "83.7%"],
      ["Zone 2", "40", "1", "$800.00", "$20.00", "13.1%"],
      ["Zone 3", "2", "0", "$0.00", "$0.00", "0.0%"],
      ["Unassigned", "2", "1", "$200.00", "$100.00", "3.3%"],
      ["Total / Fleet Summary", "144", "4", "$6,125.00", "$42.53", "100.0%"],
    ]);
  });

  it("is a table", () => {
    expect(block(render(), "zones-block")).toContain('role="table"');
  });
});

describe("the models block (D20)", () => {
  it("has the title and the grey line", () => {
    const content = text(block(render(), "models-block"));
    expect(content).toContain("Top High-Cost Models");
    expect(content).toContain("The five models with the highest maintenance cost");
  });

  it("lists the top models with a rank written #1, then the total row", () => {
    const rows = rowsOf(block(render(), "models-block"));
    expect(rows[0]).toEqual([
      "Rank",
      "Model",
      "Assigned Units",
      "Avg Cost / Unit",
      "Repairs",
      "Cost",
    ]);
    expect(rows.slice(1)).toEqual([
      ["#1", "TSP15-450", "10", "$512.50", "2", "$5,125.00"],
      ["#2", "Speedy4510", "4", "$200.00", "1", "$800.00"],
      ["", "Top 5 Models Total", "14", "$423.21", "3", "$5,925.00"],
    ]);
  });

  it("says No model numbers yet when no bleacher has a model number", () => {
    const inputs = fleetInputs({
      bleachers: fleetBleachers().map((b) => ({ ...b, modelNumber: null })),
    });
    const models = block(render({ inputs }), "models-block");
    expect(testIdText(models, "models-empty-title")).toBe("No model numbers yet");
    expect(testIdText(models, "models-empty-sub")).toBe(
      "This block fills in once model numbers are set on the bleachers.",
    );
    expect(models).not.toContain('role="table"');
  });

  it("says No repairs in the year when there are model numbers but no repair", () => {
    const inputs = fleetInputs({ repairs: [], services: [], repairBleachers: [] });
    const models = block(render({ inputs }), "models-block");
    expect(testIdText(models, "models-empty-title")).toBe("No repairs in 2026");
    expect(testIdText(models, "models-empty-sub")).toBe(
      "Models with maintenance cost will appear here.",
    );
    expect(models).not.toContain('role="table"');
  });

  it("says No repairs yet on All time", () => {
    const inputs = fleetInputs({ repairs: [], services: [], repairBleachers: [] });
    const models = block(render({ inputs, choice: ALL }), "models-block");
    expect(testIdText(models, "models-empty-title")).toBe("No repairs yet");
  });
});

describe("the category table (D21)", () => {
  it("has the title, the grey line and the six columns", () => {
    const categories = block(render(), "categories-block");
    expect(text(categories)).toContain("Unit Damage Category & Expense Breakdown");
    expect(text(categories)).toContain("A repair with two categories counts in both");
    expect(rowsOf(categories)[0]).toEqual([
      "Failure Category",
      "Number of Repairs",
      "Total Expense",
      "Avg Cost / Job",
      "% Fleet Spend",
      "Largest Spend Vendor",
    ]);
  });

  it("lists every category, also one with no spend, Unassigned last, then the total row", () => {
    expect(rowsOf(block(render(), "categories-block")).slice(1)).toEqual([
      ["Welding", "2", "$3,625.00", "$1,812.50", "59.2%", "Dallas Trailer Repair"],
      ["Tires", "2", "$2,300.00", "$1,150.00", "37.6%", "Dallas Trailer Repair"],
      ["Hydraulics", "0", "$0.00", "$0.00", "0.0%", "—"],
      ["Unassigned", "1", "$200.00", "$200.00", "3.3%", "—"],
      ["Total Category Spend", "5", "$6,125.00", "$1,225.00", "100.0%", ""],
    ]);
  });
});

describe("the chart block (D22)", () => {
  it("sits after the category table and before the vendors", () => {
    const markup = render();
    const at = (id: string) => markup.indexOf(`data-testid="${id}"`);
    expect(at("categories-block")).toBeGreaterThan(-1);
    expect(at("chart-block")).toBeGreaterThan(at("categories-block"));
    expect(at("vendors-block")).toBeGreaterThan(at("chart-block"));
  });

  it("writes the names of the categories in the order of the table", () => {
    const content = text(block(render(), "chart-block"));
    expect(content).toContain("Maintenance Spend by Category");
    const places = ["Welding", "Tires", "Hydraulics", "Unassigned"].map((name) =>
      content.indexOf(name),
    );
    expect(places.every((place) => place > -1)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
  });

  it("says No spend to show when the year has no spend", () => {
    const inputs = fleetInputs({ repairs: [], services: [], repairBleachers: [] });
    expect(text(block(render({ inputs }), "chart-block"))).toContain("No spend to show for 2026.");
    expect(text(block(render({ inputs, choice: ALL }), "chart-block"))).toContain(
      "No spend to show yet.",
    );
  });
});

describe("the vendor table (D23)", () => {
  it("has the title, the grey line with the number of vendors and the six columns", () => {
    const vendors = block(render(), "vendors-block");
    const content = text(vendors);
    expect(content).toContain("Service Vendor Repair & Parts Cost Breakdown");
    expect(content).toContain(
      "Top 6 of 2 vendors by Labor + Parts. Tax and freight are not included. Repairs with no vendor are not listed.",
    );
    expect(rowsOf(vendors)[0]).toEqual([
      "Service Vendor",
      "Work Orders",
      "Labor Cost",
      "Parts Cost",
      "Total Labor & Parts Spend",
      "% Labor & Parts",
    ]);
  });

  it("lists the vendors by Labor + Parts, then a total row over every vendor with spend", () => {
    expect(rowsOf(block(render(), "vendors-block")).slice(1)).toEqual([
      ["Dallas Trailer Repair", "2", "$4,200.00", "$850.00", "$5,050.00", "86.3%"],
      ["Kaypark", "1", "$0.00", "$800.00", "$800.00", "13.7%"],
      [
        "Total Labor & Parts Spend, all 2 vendors",
        "3",
        "$4,200.00",
        "$1,650.00",
        "$5,850.00",
        "100.0%",
      ],
    ]);
  });

  it("has no No vendor row, even with a repair that has no vendor", () => {
    const names = rowsOf(block(render(), "vendors-block")).map((cells) => cells[0]);
    expect(names.some((name) => /^no vendor/i.test(name))).toBe(false);
  });

  it("says No vendor spend in the year, with a short grey line, when there is none", () => {
    const inputs = fleetInputs({ repairs: [], services: [], repairBleachers: [] });
    const vendors = block(render({ inputs }), "vendors-block");
    expect(text(vendors)).toContain("Top 6 vendors by Labor + Parts");
    expect(text(vendors)).not.toContain("Tax and freight");
    expect(testIdText(vendors, "vendors-empty")).toBe("No vendor spend in 2026.");
    expect(vendors).not.toContain('role="table"');
  });

  it("says No vendor spend yet on All time", () => {
    const inputs = fleetInputs({ repairs: [], services: [], repairBleachers: [] });
    expect(
      testIdText(block(render({ inputs, choice: ALL }), "vendors-block"), "vendors-empty"),
    ).toBe("No vendor spend yet.");
  });
});

describe("the tables cannot be sorted (D41)", () => {
  it("has no button and no aria-sort in any table block", () => {
    const markup = render();
    for (const id of ["zones-block", "models-block", "categories-block", "vendors-block"]) {
      const part = block(markup, id);
      expect(part, id).not.toContain("<button");
      expect(part, id).not.toContain("aria-sort");
      expect(part, id).not.toContain("onclick");
    }
  });

  it("writes the column headers as plain column headers", () => {
    const zones = block(render(), "zones-block");
    expect(zones.match(/role="columnheader"/g)).toHaveLength(6);
  });
});

describe("the CAD note (D10)", () => {
  const rate = (day: string) => (day < "2026-06-01" ? 0.7 : null);
  const withCad = (...cad: ReturnType<typeof cadRepair>[]) =>
    fleetInputs({ repairs: [...fleetInputs().repairs, ...cad] });

  it("is not shown when the period has no CAD repair", () => {
    const markup = render();
    expect(markup).not.toContain('data-testid="cad-note"');
    expect(markup).not.toContain('data-testid="rate-missing"');
  });

  it("says one repair was converted", () => {
    const markup = render({
      inputs: withCad(cadRepair("c1", "2026-04-01")),
      rates: { status: "ready", rateFor: rate },
    });
    expect(testIdText(markup, "cad-note-text")).toBe(
      "1 CAD repair was converted to USD at the Frankfurter (ECB) rate of its Repair from day.",
    );
  });

  it("says how many repairs were converted", () => {
    const markup = render({
      inputs: withCad(cadRepair("c1", "2026-04-01"), cadRepair("c2", "2026-04-02")),
      rates: { status: "ready", rateFor: rate },
    });
    expect(testIdText(markup, "cad-note-text")).toBe(
      "2 CAD repairs were converted to USD at the Frankfurter (ECB) rate of their Repair from day.",
    );
  });

  it("adds the converted repair to the spend", () => {
    const markup = render({
      inputs: withCad(cadRepair("c1", "2026-04-01")),
      rates: { status: "ready", rateFor: rate },
    });
    expect(card(markup, "total").value).toBe("$6,825.00");
  });
});

describe("the missing-rate line (D9)", () => {
  const withCad = (...cad: ReturnType<typeof cadRepair>[]) =>
    fleetInputs({ repairs: [...fleetInputs().repairs, ...cad] });

  it("says one repair has no rate and is not counted", () => {
    const markup = render({ inputs: withCad(cadRepair("c1", "2026-04-01")), rates: NO_RATE });
    expect(testIdText(markup, "rate-missing-text")).toBe(
      "1 CAD repair has no exchange rate yet and is not counted. Open the page again when you are online.",
    );
    expect(markup).not.toContain('data-testid="cad-note"');
  });

  it("says how many repairs have no rate", () => {
    const markup = render({
      inputs: withCad(cadRepair("c1", "2026-04-01"), cadRepair("c2", "2026-04-02")),
      rates: NO_RATE,
    });
    expect(testIdText(markup, "rate-missing-text")).toBe(
      "2 CAD repairs have no exchange rate yet and are not counted. Open the page again when you are online.",
    );
  });

  it("leaves the repair out of the spend", () => {
    const markup = render({ inputs: withCad(cadRepair("c1", "2026-04-01")), rates: NO_RATE });
    expect(card(markup, "total").value).toBe("$6,125.00");
  });

  it("is an amber block", () => {
    const markup = render({ inputs: withCad(cadRepair("c1", "2026-04-01")), rates: NO_RATE });
    expect(tagOf(markup, "rate-missing")).toContain("#fffbeb");
    expect(tagOf(markup, "rate-missing")).toContain("#92400e");
  });

  it("shows both lines when some repairs have a rate and some do not, the grey one first", () => {
    const markup = render({
      inputs: withCad(cadRepair("c1", "2026-04-01"), cadRepair("c2", "2026-09-01")),
      rates: { status: "ready", rateFor: (day) => (day < "2026-06-01" ? 0.7 : null) },
    });
    const grey = markup.indexOf('data-testid="cad-note"');
    const amber = markup.indexOf('data-testid="rate-missing"');
    expect(grey).toBeGreaterThan(-1);
    expect(amber).toBeGreaterThan(grey);
    expect(testIdText(markup, "cad-note-text")).toContain("1 CAD repair was converted");
    expect(testIdText(markup, "rate-missing-text")).toContain(
      "1 CAD repair has no exchange rate yet",
    );
  });

  it("puts both lines before the cards", () => {
    const markup = render({
      inputs: withCad(cadRepair("c1", "2026-04-01"), cadRepair("c2", "2026-09-01")),
      rates: { status: "ready", rateFor: (day) => (day < "2026-06-01" ? 0.7 : null) },
    });
    expect(markup.indexOf('data-testid="rate-missing"')).toBeLessThan(
      markup.indexOf('data-testid="card-total"'),
    );
  });
});

describe("the empty year (board EmptyYear)", () => {
  const empty = () =>
    render({
      inputs: fleetInputs({ repairs: [], services: [], repairBleachers: [], budgets: [] }),
    });

  it("shows zeros on the cards, and Bleachers Ready from today's bleachers", () => {
    const markup = empty();
    expect(card(markup, "total")).toEqual({
      value: "$0.00",
      note: "2026 spend across 144 bleachers",
    });
    expect(card(markup, "ready")).toEqual({ value: "100.0%", note: "144 of 144 ready to go" });
    expect(card(markup, "avg")).toEqual({ value: "$0.00", note: "Range: $0 – $0" });
    expect(card(markup, "open")).toEqual({ value: "0", note: "No open repairs" });
  });

  it("still lists every zone and every category with zeros", () => {
    const markup = empty();
    expect(rowsOf(block(markup, "zones-block")).slice(1)).toEqual([
      ["Zone 1", "100", "0", "$0.00", "$0.00", "0.0%"],
      ["Zone 2", "40", "0", "$0.00", "$0.00", "0.0%"],
      ["Zone 3", "2", "0", "$0.00", "$0.00", "0.0%"],
      ["Unassigned", "2", "0", "$0.00", "$0.00", "0.0%"],
      ["Total / Fleet Summary", "144", "0", "$0.00", "$0.00", "0.0%"],
    ]);
    expect(rowsOf(block(markup, "categories-block")).slice(1)).toEqual([
      ["Hydraulics", "0", "$0.00", "$0.00", "0.0%", "—"],
      ["Tires", "0", "$0.00", "$0.00", "0.0%", "—"],
      ["Welding", "0", "$0.00", "$0.00", "0.0%", "—"],
      ["Unassigned", "0", "$0.00", "$0.00", "0.0%", "—"],
      ["Total Category Spend", "0", "$0.00", "$0.00", "0.0%", ""],
    ]);
  });

  it("shows the empty texts of the models, chart and vendors blocks", () => {
    const markup = empty();
    expect(testIdText(markup, "models-empty-title")).toBe("No repairs in 2026");
    expect(text(block(markup, "chart-block"))).toContain("No spend to show for 2026.");
    expect(testIdText(markup, "vendors-empty")).toBe("No vendor spend in 2026.");
  });

  it("shows no CAD note", () => {
    expect(empty()).not.toContain('data-testid="cad-note"');
  });
});

describe("the loading state (§2.8)", () => {
  it("shows the line, five grey cards and five grey blocks, marked busy", () => {
    const markup = render({ isLoading: true });
    expect(markup).toContain('aria-busy="true"');
    expect(text(markup)).toContain("Reading repairs and exchange rates");
    expect(markup.match(/data-testid="skeleton-card"/g)).toHaveLength(5);
    expect(markup.match(/data-testid="skeleton-block"/g)).toHaveLength(5);
  });

  it("shows no figure, table or note while loading", () => {
    const markup = render({ isLoading: true });
    expect(markup).not.toContain('role="table"');
    expect(markup).not.toContain('data-testid="card-total"');
    expect(markup).not.toContain('data-testid="cad-note"');
  });

  it("loads while the local queries have not answered", () => {
    expect(render({ isLoading: true })).toContain('aria-busy="true"');
  });

  it("loads while the rates are loading", () => {
    const markup = render({ rates: { status: "loading", rateFor: () => null } });
    expect(markup).toContain('aria-busy="true"');
    expect(text(markup)).toContain("Reading repairs and exchange rates");
  });

  it.each(["idle", "ready", "unavailable"] as const)(
    "shows the page, not the loading state, when the rates are %s",
    (status) => {
      const markup = render({ rates: { status, rateFor: () => null } });
      expect(markup).not.toContain('aria-busy="true"');
      expect(markup).toContain('data-testid="card-total"');
    },
  );

  it("shows no loading line once the page is shown", () => {
    expect(text(render())).not.toContain("Reading repairs and exchange rates");
  });
});
