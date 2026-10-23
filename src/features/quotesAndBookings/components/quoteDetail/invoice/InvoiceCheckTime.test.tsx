import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Settings } from "luxon";

// Spec: docs/specs/qbo-invoice-08-view-and-check.md §4 (the check time) and S7. The component is
// rendered on the server with `useTypedQuery` replaced: what it decides is what the row says, and
// that a new row (the local database changed) gives a new line. How PowerSync delivers the row is
// not under test.

const mocks = vi.hoisted(() => ({
  answer: { data: [], isLoading: false } as { data: unknown[]; isLoading: boolean },
  compiled: undefined as { sql: string; parameters: unknown[] } | undefined,
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
  useTypedQuery: (compiled: { sql: string; parameters: unknown[] }) => {
    mocks.compiled = compiled;
    return mocks.answer;
  },
}));

import { InvoiceCheckTime, InvoiceCheckTimeView } from "./InvoiceCheckTime";

const row = (checkedAt: string | null, failedAt: string | null) => ({
  qbo_invoice_checked_at: checkedAt,
  qbo_invoice_check_failed_at: failedAt,
});

/** What the component draws for the local row at this moment. */
const drawn = (localRow: object | null) => {
  mocks.answer = { data: localRow ? [localRow] : [], isLoading: false };
  return renderToStaticMarkup(<InvoiceCheckTime eventId="evt-1" />);
};

describe("InvoiceCheckTime", () => {
  const previousZone = Settings.defaultZone;
  beforeAll(() => {
    Settings.defaultZone = "UTC";
  });
  afterAll(() => {
    Settings.defaultZone = previousZone;
  });
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false };
    mocks.compiled = undefined;
  });

  it("reads both check columns of the event from the local database, by the event's id", () => {
    drawn(row(null, null));

    expect(mocks.compiled?.sql).toContain('"Events"');
    expect(mocks.compiled?.sql).toContain("qbo_invoice_checked_at");
    expect(mocks.compiled?.sql).toContain("qbo_invoice_check_failed_at");
    expect(mocks.compiled?.parameters).toContain("evt-1");
  });

  it("S7: a quote never checked says 'Not checked yet'", () => {
    expect(drawn(row(null, null))).toContain("Not checked yet");
  });

  it("S7: a quote that was checked says when", () => {
    expect(drawn(row("2026-10-23T14:05:00.000Z", null))).toContain("Checked 23 Oct 2026, 14:05");
  });

  it("S7: a quote whose last attempt failed shows the red line, and the last good check under it", () => {
    const html = drawn(row("2026-10-23T14:05:00.000Z", "2026-10-23T14:30:00.000Z"));

    expect(html).toContain("The last check failed (23 Oct 2026, 14:30). Press Check again.");
    expect(html).toContain("Last successful check 23 Oct 2026, 14:05");
    expect(html).toMatch(/class="[^"]*\btext-red-\d+[^"]*"[^>]*>The last check failed/);
    expect(html).not.toContain("Not checked yet");
  });

  it("only the failure line is red: the line about the earlier good check is not", () => {
    const html = drawn(row("2026-10-23T14:05:00.000Z", "2026-10-23T14:30:00.000Z"));

    expect(html).not.toMatch(/text-red-\d+[^>]*>Last successful check/);
  });

  it("a normal check time is not red", () => {
    expect(drawn(row("2026-10-23T14:05:00.000Z", null))).not.toMatch(/text-red/);
    expect(drawn(row(null, null))).not.toMatch(/text-red/);
  });

  it("S7: it follows a change of the local row, with no reload", () => {
    expect(drawn(row(null, null))).toContain("Not checked yet");

    // A check fails: the server writes the failure time and sync brings it down.
    const failed = drawn(row(null, "2026-10-23T14:30:00.000Z"));
    expect(failed).toContain("The last check failed (23 Oct 2026, 14:30)");
    expect(failed).not.toContain("Not checked yet");

    // Check again succeeds: the check time passes the failure time.
    const checked = drawn(row("2026-10-23T15:00:00.000Z", "2026-10-23T14:30:00.000Z"));
    expect(checked).toContain("Checked 23 Oct 2026, 15:00");
    expect(checked).not.toContain("The last check failed");
    expect(checked).not.toMatch(/text-red/);
  });

  it("draws nothing while the event is not in the local database yet, rather than 'Not checked yet'", () => {
    expect(drawn(null)).toBe("");
  });
});

describe("InvoiceCheckTimeView", () => {
  it("draws each line it is given, in order", () => {
    const html = renderToStaticMarkup(
      <InvoiceCheckTimeView
        description={{ failed: false, lines: ["Checked 23 Oct 2026, 14:05"] }}
      />,
    );
    expect(html).toContain("Checked 23 Oct 2026, 14:05");
  });
});
