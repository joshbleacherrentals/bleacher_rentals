import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Breakdowns } from "./Breakdowns";
import type { BreakdownRow } from "../logic/stats";
import { columnInfo } from "../logic/columnInfo";
import { metricInfo } from "../logic/metricInfo";

const noop = () => {};

const row = (over: Partial<BreakdownRow> = {}): BreakdownRow => ({
  dimension: "role",
  value: "admin",
  n: 3,
  errors: 0,
  p50: 200,
  p95: 290,
  p99: 298,
  calls: null,
  slowCalls: null,
  maxMs: null,
  ...over,
});

const state = { isLoading: false, error: null as unknown };

describe("Breakdowns", () => {
  it("asks for a metric when none is chosen", () => {
    const html = renderToStaticMarkup(
      <Breakdowns metric={null} rows={undefined} {...state} onClear={noop} />,
    );
    expect(html).toContain("Choose a metric above");
  });

  it("names the metric it is about and offers to clear it", () => {
    const html = renderToStaticMarkup(
      <Breakdowns metric="powersync.connect" rows={[row()]} {...state} onClear={noop} />,
    );
    expect(html).toContain("powersync.connect");
    expect(html).toContain("Clear");
  });

  it("explains the metric it is about with the info icon", () => {
    const html = renderToStaticMarkup(
      <Breakdowns metric="ui.first_data" rows={[row()]} {...state} onClear={noop} />,
    );
    expect(html).toContain(`aria-label="${metricInfo("ui.first_data")}"`);
  });

  it("splits an ordinary metric by role, device class, OS and browser", () => {
    const html = renderToStaticMarkup(
      <Breakdowns
        metric="powersync.connect"
        rows={[
          row({ dimension: "role", value: "admin" }),
          row({ dimension: "device_class", value: "mobile", n: 2, p50: 450 }),
          row({ dimension: "os", value: "macos" }),
          row({ dimension: "browser", value: "chrome 141" }),
        ]}
        {...state}
        onClear={noop}
      />,
    );
    for (const heading of ["By role", "By device class", "By OS", "By browser"]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain("mobile");
    expect(html).toContain("450 ms");
    expect(html).toContain("chrome 141");
  });

  it("shows the number of events and the percentiles of each slice", () => {
    const html = renderToStaticMarkup(
      <Breakdowns metric="powersync.connect" rows={[row()]} {...state} onClear={noop} />,
    );
    for (const heading of ["Events", "P50", "P95", "P99", "Errors"]) {
      expect(html).toContain(`>${heading}<`);
    }
  });

  it("splits a sqlite metric by op and tables, as calls, with no percentile", () => {
    const html = renderToStaticMarkup(
      <Breakdowns
        metric="sqlite.query"
        rows={[
          row({
            dimension: "op",
            value: "select",
            n: 103,
            p50: null,
            p95: null,
            p99: null,
            calls: 103,
            slowCalls: 2,
            maxMs: 200,
          }),
          row({
            dimension: "tables",
            value: "Users",
            n: 103,
            p50: null,
            p95: null,
            p99: null,
            calls: 103,
            slowCalls: 2,
            maxMs: 200,
          }),
        ]}
        {...state}
        onClear={noop}
      />,
    );
    expect(html).toContain("By op");
    expect(html).toContain("By tables");
    for (const heading of ["Calls", "Slow calls", "Slowest"]) {
      expect(html).toContain(`>${heading}<`);
    }
    expect(html).not.toContain(">P50<");
    expect(html).not.toContain(">P95<");
    expect(html).toContain("200 ms");
  });

  it("says so when the metric has no events", () => {
    const html = renderToStaticMarkup(
      <Breakdowns metric="ui.first_data" rows={[]} {...state} onClear={noop} />,
    );
    expect(html).toContain("No events for this metric");
  });

  it("shows loading while it loads", () => {
    const html = renderToStaticMarkup(
      <Breakdowns metric="ui.first_data" rows={undefined} isLoading error={null} onClear={noop} />,
    );
    expect(html).toContain("Loading");
  });

  it("explains an error by its kind only", () => {
    const html = renderToStaticMarkup(
      <Breakdowns
        metric="ui.first_data"
        rows={undefined}
        isLoading={false}
        error={{ code: "42501", message: "person@example.com" }}
        onClear={noop}
      />,
    );
    expect(html).toContain("pg:42501");
    expect(html).not.toContain("person@example.com");
  });

  it("leaves out a dimension the metric has no rows for", () => {
    const html = renderToStaticMarkup(
      <Breakdowns metric="app.x" rows={[row({ dimension: "role" })]} {...state} onClear={noop} />,
    );
    expect(html).toContain("By role");
    expect(html).not.toContain("By OS");
  });
});

describe("Breakdowns: the info icon on each column heading", () => {
  it.each(["Value", "Events", "P50", "P95", "P99", "Errors"])("ordinary metric: %s", (header) => {
    const html = renderToStaticMarkup(
      <Breakdowns metric="powersync.connect" rows={[row()]} {...state} onClear={noop} />,
    );
    expect(html).toContain(`aria-label="${columnInfo("breakdown", header)}"`);
  });

  it.each(["Value", "Calls", "Slow calls", "Slowest", "Errors"])("sqlite metric: %s", (header) => {
    const html = renderToStaticMarkup(
      <Breakdowns
        metric="sqlite.query"
        rows={[
          row({
            dimension: "op",
            value: "select",
            n: 3,
            p50: null,
            p95: null,
            p99: null,
            calls: 3,
            slowCalls: 1,
            maxMs: 90,
          }),
        ]}
        {...state}
        onClear={noop}
      />,
    );
    expect(html).toContain(`aria-label="${columnInfo("sqliteBreakdown", header)}"`);
  });
});
