import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CategorySpendChart } from "./CategorySpendChart";
import type { CategoryRow } from "../utils/analyticsTypes";

// docs/specs/dashboard-analytics-05-page.md §2.6 (D22, D42). Recharts draws nothing when it is
// rendered to text, so its parts are replaced by stand-ins that print their name and props. What is
// under test is what the page asks the chart to draw: the data, the scale, the labels, and the
// parts it must not have (a tooltip).

const captured = vi.hoisted(() => ({
  labelFormatter: undefined as undefined | ((value: number) => string),
  tickFormatter: undefined as undefined | ((value: number) => string),
  minPointSize: undefined as undefined | ((value: number) => number),
}));

vi.mock("recharts", async () => {
  const React = await import("react");
  const stand = (name: string) => {
    const Part = ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) => {
      if (name === "LabelList") captured.labelFormatter = props.formatter as never;
      if (name === "YAxis") captured.tickFormatter = props.tickFormatter as never;
      if (name === "Bar") captured.minPointSize = props.minPointSize as never;
      const printable = Object.fromEntries(
        Object.entries(props).filter(([, value]) => typeof value !== "function"),
      );
      return (
        <div data-part={name} data-props={JSON.stringify(printable)}>
          {children}
        </div>
      );
    };
    return Part;
  };
  return {
    ResponsiveContainer: stand("ResponsiveContainer"),
    BarChart: stand("BarChart"),
    Bar: stand("Bar"),
    CartesianGrid: stand("CartesianGrid"),
    XAxis: stand("XAxis"),
    YAxis: stand("YAxis"),
    LabelList: stand("LabelList"),
    Tooltip: stand("Tooltip"),
    Cell: stand("Cell"),
  };
});

const row = (name: string, expenseCents: number): CategoryRow => ({
  categoryId: name.toLowerCase(),
  name,
  repairs: expenseCents > 0 ? 1 : 0,
  expenseCents,
  avgCostCents: expenseCents,
  share: 0,
  topVendor: null,
});

const ROWS = [row("Welding", 1120635), row("Tires", 230000), row("Hydraulics", 0)];

const render = (rows: CategoryRow[] = ROWS, period = { kind: "year", year: 2026 } as const) =>
  renderToStaticMarkup(<CategorySpendChart rows={rows} period={period} />);

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The props the stand-in printed for the first part with this name. */
function propsOf(markup: string, name: string): Record<string, unknown> {
  const start = markup.indexOf(`data-part="${name}"`);
  expect(start, name).toBeGreaterThan(-1);
  const found = markup.slice(start).match(/data-props="([^"]*)"/);
  return JSON.parse((found?.[1] ?? "{}").replace(/&quot;/g, '"'));
}

describe("CategorySpendChart with spend", () => {
  beforeEach(() => {
    captured.labelFormatter = undefined;
    captured.tickFormatter = undefined;
    captured.minPointSize = undefined;
  });

  it("is the block Maintenance Spend by Category with its grey line", () => {
    const markup = render();
    expect(markup).toContain('data-testid="chart-block"');
    expect(text(markup)).toContain("Maintenance Spend by Category");
    expect(text(markup)).toContain("Total expense per damage category, USD");
  });

  it("gives the chart an aria-label with its title", () => {
    expect(render()).toContain('aria-label="Maintenance Spend by Category"');
  });

  it("draws one dark blue column of expenseCents per category, in the order of the rows", () => {
    const markup = render();
    const chart = propsOf(markup, "BarChart");
    expect(chart.data).toEqual([
      { name: "Welding", expenseCents: 1120635 },
      { name: "Tires", expenseCents: 230000 },
      { name: "Hydraulics", expenseCents: 0 },
    ]);
    const bar = propsOf(markup, "Bar");
    expect(bar.dataKey).toBe("expenseCents");
    expect(bar.fill).toBe("#10365a");
  });

  it("does not animate", () => {
    expect(propsOf(render(), "Bar").isAnimationActive).toBe(false);
  });

  it("has no tooltip (D42)", () => {
    expect(render()).not.toContain('data-part="Tooltip"');
  });

  it("draws light grid lines and a vertical axis on the round scale, in cents", () => {
    const markup = render();
    expect(propsOf(markup, "CartesianGrid").stroke).toBe("#e5e7eb");
    const axis = propsOf(markup, "YAxis");
    expect(axis.ticks).toEqual([0, 500000, 1000000, 1500000]);
    expect(axis.domain).toEqual([0, 1500000]);
  });

  it("labels the axis $0, $5k, $10k, $15k", () => {
    render();
    const ticks = [0, 500000, 1000000, 1500000].map((cents) => captured.tickFormatter?.(cents));
    expect(ticks).toEqual(["$0", "$5k", "$10k", "$15k"]);
  });

  it("writes the value above each column in whole dollars, also $0", () => {
    const markup = render();
    expect(propsOf(markup, "LabelList").position).toBe("top");
    expect(captured.labelFormatter?.(1120635)).toBe("$11,206");
    expect(captured.labelFormatter?.(0)).toBe("$0");
  });

  it("keeps a thin column for a small value and none for zero", () => {
    render();
    expect(captured.minPointSize?.(100)).toBeGreaterThan(0);
    expect(captured.minPointSize?.(0)).toBe(0);
  });

  it("writes the category names under the columns, in order, then the axis title", () => {
    const content = text(render());
    const welding = content.indexOf("Welding");
    const tires = content.indexOf("Tires");
    const hydraulics = content.indexOf("Hydraulics");
    expect(welding).toBeGreaterThan(-1);
    expect(tires).toBeGreaterThan(welding);
    expect(hydraulics).toBeGreaterThan(tires);
    expect(content.indexOf("Damage category")).toBeGreaterThan(hydraulics);
  });
});

describe("CategorySpendChart with no spend", () => {
  const empty = [row("Welding", 0), row("Tires", 0)];

  it("shows no chart and the text for the year", () => {
    const markup = render(empty);
    expect(markup).not.toContain('data-part="BarChart"');
    expect(markup).not.toContain('aria-label="Maintenance Spend by Category"');
    expect(text(markup)).toContain("No spend to show for 2026.");
  });

  it("keeps the title and the grey line", () => {
    const content = text(render(empty));
    expect(content).toContain("Maintenance Spend by Category");
    expect(content).toContain("Total expense per damage category, USD");
  });

  it("writes the text for All time", () => {
    expect(text(render(empty, { kind: "all" } as never))).toContain("No spend to show yet.");
  });
});
