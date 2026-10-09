import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Block, ErrorsTable, HealthPanel, MetricsTable, SqliteTable } from "./StatTables";
import type { ErrorRow, HealthRow, MetricRow, SqliteRow } from "../logic/stats";
import { columnInfo } from "../logic/columnInfo";
import { metricInfo } from "../logic/metricInfo";

const noop = () => {};

const metric = (over: Partial<MetricRow> = {}): MetricRow => ({
  name: "powersync.connect",
  n: 1234,
  errors: 2,
  p50: 350,
  p75: 450,
  p90: 520,
  p95: 575,
  p99: 599,
  maxMs: 1000,
  ...over,
});

describe("MetricsTable", () => {
  it("shows a metric with its sample size and percentiles", () => {
    const html = renderToStaticMarkup(
      <MetricsTable rows={[metric()]} selected={null} onSelect={noop} />,
    );
    expect(html).toContain("powersync.connect");
    expect(html).toContain("1,234");
    expect(html).toContain("350 ms");
    expect(html).toContain("575 ms");
    expect(html).toContain("1,000 ms");
  });

  it("has a column for the number of events and for each of the five percentiles", () => {
    const html = renderToStaticMarkup(
      <MetricsTable rows={[metric()]} selected={null} onSelect={noop} />,
    );
    for (const heading of ["Events", "P50", "P75", "P90", "P95", "P99", "Max", "Errors"]) {
      expect(html).toContain(`>${heading}<`);
    }
  });

  it("groups the rows under their stage, in the order of the request", () => {
    const html = renderToStaticMarkup(
      <MetricsTable
        rows={[
          metric({ name: "ui.first_data" }),
          metric({ name: "powersync.connect" }),
          metric({ name: "app.start" }),
        ]}
        selected={null}
        onSelect={noop}
      />,
    );
    const order = ["app", "powersync", "ui"].map((stage) => html.indexOf(`data-stage="${stage}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("marks a value that rests on too few events", () => {
    const few = renderToStaticMarkup(
      <MetricsTable rows={[metric({ n: 7 })]} selected={null} onSelect={noop} />,
    );
    expect(few).toContain('data-weak="true"');
    expect(few).toContain("few events");

    const many = renderToStaticMarkup(
      <MetricsTable rows={[metric({ n: 150 })]} selected={null} onSelect={noop} />,
    );
    expect(many).not.toContain('data-weak="true"');
  });

  it("marks only P95 and P99, and P95 only below 20 events", () => {
    const html = renderToStaticMarkup(
      <MetricsTable rows={[metric({ n: 50 })]} selected={null} onSelect={noop} />,
    );
    expect(html.match(/data-weak="true"/g)).toHaveLength(1);
  });

  it("selects the row that is in the address", () => {
    const html = renderToStaticMarkup(
      <MetricsTable
        rows={[metric({ name: "powersync.connect" }), metric({ name: "powersync.reconnect" })]}
        selected="powersync.reconnect"
        onSelect={noop}
      />,
    );
    expect(html).toMatch(/data-metric="powersync.reconnect"[^>]*aria-selected="true"/);
    expect(html).toMatch(/data-metric="powersync.connect"[^>]*aria-selected="false"/);
  });

  it("lets a row be reached with the keyboard", () => {
    const html = renderToStaticMarkup(
      <MetricsTable rows={[metric()]} selected={null} onSelect={noop} />,
    );
    expect(html).toContain('tabindex="0"');
  });
});

describe("SqliteTable", () => {
  const row: SqliteRow = {
    name: "sqlite.query",
    calls: 103,
    slowCalls: 2,
    percentiles: [
      { p: 0.5, kind: "bucket", value: 5 },
      { p: 0.75, kind: "bucket", value: 50 },
      { p: 0.9, kind: "bucket", value: 50 },
      { p: 0.95, kind: "bucket", value: 50 },
      { p: 0.99, kind: "exact", value: 80 },
    ],
  };

  it("shows a bucket as an upper bound and an exact value as itself", () => {
    const html = renderToStaticMarkup(<SqliteTable rows={[row]} selected={null} onSelect={noop} />);
    expect(html).toContain("≤ 5 ms");
    expect(html).toContain(">80 ms<");
  });

  it("shows the calls and the slow calls", () => {
    const html = renderToStaticMarkup(<SqliteTable rows={[row]} selected={null} onSelect={noop} />);
    expect(html).toContain(">103<");
    expect(html).toContain(">2<");
    expect(html).toContain("Slow calls");
  });

  it("explains why a figure is a bucket", () => {
    const html = renderToStaticMarkup(<SqliteTable rows={[row]} selected={null} onSelect={noop} />);
    expect(html).toMatch(/bucket/i);
  });

  it("selects its row like the metrics table does", () => {
    const html = renderToStaticMarkup(
      <SqliteTable rows={[row]} selected="sqlite.query" onSelect={noop} />,
    );
    expect(html).toMatch(/data-metric="sqlite.query"[^>]*aria-selected="true"/);
  });
});

describe("ErrorsTable", () => {
  const error: ErrorRow = {
    name: "sync.upload",
    kind: "pg:23505",
    count: 12,
    medianMs: 60,
    maxMs: 70,
    firstSeen: "2026-10-09T10:00:00Z",
    lastSeen: "2026-10-09T11:00:00Z",
  };

  it("lists the metric, the kind, the count and when it was seen", () => {
    const html = renderToStaticMarkup(<ErrorsTable rows={[error]} />);
    expect(html).toContain("sync.upload");
    expect(html).toContain("pg:23505");
    expect(html).toContain(">12<");
    expect(html).toContain("60 ms");
    expect(html).toContain("2026-10-09");
  });
});

describe("HealthPanel", () => {
  const health: HealthRow = {
    events: 1900,
    dropped: 10,
    loads: 42,
    rows: 2100,
    oldest: "2026-09-09T00:00:00Z",
    newest: "2026-10-09T11:00:00Z",
    sizeBytes: 8192,
  };

  it("shows the events, the drops, the page loads and the table's size", () => {
    const html = renderToStaticMarkup(<HealthPanel health={health} />);
    expect(html).toContain("1,900");
    expect(html).toContain(">10<");
    expect(html).toContain(">42<");
    expect(html).toContain("2,100");
    expect(html).toContain("8.0 KB");
  });

  it("warns that an empty table is not the same as a quiet week", () => {
    const html = renderToStaticMarkup(
      <HealthPanel health={{ ...health, rows: 0, events: 0, oldest: null, newest: null }} />,
    );
    expect(html).toMatch(/table is empty/i);
    expect(html).toMatch(/crash/i);
  });

  it("is quiet when the numbers are not there", () => {
    expect(renderToStaticMarkup(<HealthPanel health={null} />)).not.toContain("NaN");
  });
});

describe("Block", () => {
  const ok = { isLoading: false, error: null, isEmpty: false };

  it("shows its content when there is something to show", () => {
    const html = renderToStaticMarkup(
      <Block title="Metrics" state={ok}>
        <p>the table</p>
      </Block>,
    );
    expect(html).toContain("Metrics");
    expect(html).toContain("the table");
  });

  it("shows that it is loading, and not its content", () => {
    const html = renderToStaticMarkup(
      <Block title="Metrics" state={{ ...ok, isLoading: true }}>
        <p>the table</p>
      </Block>,
    );
    expect(html).toContain("Loading");
    expect(html).not.toContain("the table");
  });

  it("says plainly that there are no events, instead of an empty grid", () => {
    const html = renderToStaticMarkup(
      <Block title="Metrics" state={{ ...ok, isEmpty: true }}>
        <p>the table</p>
      </Block>,
    );
    expect(html).toContain("No events for this period and environment");
    expect(html).not.toContain("the table");
  });

  it("explains an error by its kind and never by its message", () => {
    const html = renderToStaticMarkup(
      <Block
        title="Metrics"
        state={{ ...ok, error: { code: "42501", message: 'row {"email":"a@b.c"}' } }}
      >
        <p>the table</p>
      </Block>,
    );
    expect(html).toContain("pg:42501");
    expect(html).not.toContain("a@b.c");
    expect(html).not.toContain("the table");
  });

  it("explains a timeout with a hint to shorten the period", () => {
    const html = renderToStaticMarkup(
      <Block title="Metrics" state={{ ...ok, error: { code: "57014", message: "x" } }}>
        <p>the table</p>
      </Block>,
    );
    expect(html).toMatch(/shorter period/i);
  });

  it("shows an error before an empty state, because empty may only mean it never loaded", () => {
    const html = renderToStaticMarkup(
      <Block title="Metrics" state={{ isLoading: false, error: new TypeError("x"), isEmpty: true }}>
        <p>the table</p>
      </Block>,
    );
    expect(html).toMatch(/connection/i);
    expect(html).not.toContain("No events");
  });
});

describe("the info icon beside each metric", () => {
  const sqlite: SqliteRow = {
    name: "sqlite.query",
    calls: 1,
    slowCalls: 0,
    percentiles: [],
  };
  const failing: ErrorRow = {
    name: "sync.upload",
    kind: "timeout",
    count: 1,
    medianMs: 1,
    maxMs: 1,
    firstSeen: "2026-10-09T10:00:00Z",
    lastSeen: "2026-10-09T10:00:00Z",
  };

  it("sits beside the name in the metrics table and says what the metric is", () => {
    const html = renderToStaticMarkup(
      <MetricsTable
        rows={[metric({ name: "sqlite.open" }), metric({ name: "powersync.credentials" })]}
        selected={null}
        onSelect={noop}
      />,
    );
    expect(html).toContain(`aria-label="${metricInfo("sqlite.open")}"`);
    expect(html).toContain(`aria-label="${metricInfo("powersync.credentials")}"`);
  });

  it("is also in the SQLite table and in the errors table", () => {
    expect(
      renderToStaticMarkup(<SqliteTable rows={[sqlite]} selected={null} onSelect={noop} />),
    ).toContain(`aria-label="${metricInfo("sqlite.query")}"`);
    expect(renderToStaticMarkup(<ErrorsTable rows={[failing]} />)).toContain(
      `aria-label="${metricInfo("sync.upload")}"`,
    );
  });

  it("is a button that does not submit anything, so it can sit inside a clickable row", () => {
    const html = renderToStaticMarkup(
      <MetricsTable rows={[metric()]} selected={null} onSelect={noop} />,
    );
    expect(html).toMatch(/<button type="button"[^>]*aria-label=/);
  });

  it("does not change what the row's name reads as", () => {
    const html = renderToStaticMarkup(
      <MetricsTable rows={[metric({ name: "sqlite.open" })]} selected={null} onSelect={noop} />,
    );
    expect(html).toContain("sqlite.open");
  });

  it("explains a metric the page has no text for instead of leaving it blank", () => {
    const html = renderToStaticMarkup(
      <MetricsTable rows={[metric({ name: "something.new" })]} selected={null} onSelect={noop} />,
    );
    expect(html).toContain(`aria-label="${metricInfo("something.new")}"`);
  });
});

describe("the info icon on each column heading", () => {
  const html = (node: React.ReactElement) => renderToStaticMarkup(node);

  it.each(["Metric", "Events", "P50", "P75", "P90", "P95", "P99", "Max", "Errors"])(
    "metrics table: %s",
    (header) => {
      const markup = html(<MetricsTable rows={[metric()]} selected={null} onSelect={noop} />);
      expect(markup).toContain(`aria-label="${columnInfo("metrics", header)}"`);
    },
  );

  it.each(["Metric", "Calls", "Slow calls", "P50", "P75", "P90", "P95", "P99"])(
    "sqlite table: %s",
    (header) => {
      const row: SqliteRow = { name: "sqlite.query", calls: 1, slowCalls: 0, percentiles: [] };
      const markup = html(<SqliteTable rows={[row]} selected={null} onSelect={noop} />);
      expect(markup).toContain(`aria-label="${columnInfo("sqlite", header)}"`);
    },
  );

  it.each(["Metric", "Kind", "Count", "Median", "Max", "First seen (UTC)", "Last seen (UTC)"])(
    "errors table: %s",
    (header) => {
      const row: ErrorRow = {
        name: "sync.upload",
        kind: "timeout",
        count: 1,
        medianMs: 1,
        maxMs: 1,
        firstSeen: "2026-10-09T10:00:00Z",
        lastSeen: "2026-10-09T10:00:00Z",
      };
      expect(html(<ErrorsTable rows={[row]} />)).toContain(
        `aria-label="${columnInfo("errors", header)}"`,
      );
    },
  );

  it("keeps the heading text readable on its own, next to the icon", () => {
    const markup = html(<MetricsTable rows={[metric()]} selected={null} onSelect={noop} />);
    for (const header of ["Events", "P50", "P99", "Max", "Errors"]) {
      expect(markup).toContain(`>${header}<`);
    }
  });

  it("is a button that does not submit, in every heading", () => {
    const markup = html(<MetricsTable rows={[metric()]} selected={null} onSelect={noop} />);
    const headerCells = markup.match(/<th class="text-left font-semibold[^>]*>.*?<\/th>/g) ?? [];
    expect(headerCells.length).toBe(9);
    for (const cell of headerCells) expect(cell).toMatch(/<button type="button"[^>]*aria-label=/);
  });
});
