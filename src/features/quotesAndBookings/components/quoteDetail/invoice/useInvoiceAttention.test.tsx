import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/qbo-invoice-09-banner.md §4 (useInvoiceAttention) and §8. The hook is rendered on
// the server with `useTypedQuery` replaced: what it decides is what the local row means, not how
// PowerSync delivers the row.

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

import { useInvoiceAttention } from "./useInvoiceAttention";

function Probe({ eventId }: { eventId: string }) {
  return <p>{JSON.stringify(useInvoiceAttention(eventId))}</p>;
}

const reasonsOf = (row: object | null) => {
  mocks.answer = { data: row ? [row] : [], isLoading: false };
  const html = renderToStaticMarkup(<Probe eventId="evt-1" />);
  return JSON.parse(html.replace(/<\/?p>/g, "").replaceAll("&quot;", '"'));
};

const row = (over: Record<string, unknown> = {}) => ({
  qbo_invoice_id: "inv-1",
  qbo_invoice_mismatch: 1,
  qbo_invoice_mismatch_reasons: '["dates"]',
  ...over,
});

describe("useInvoiceAttention", () => {
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false };
    mocks.compiled = undefined;
  });

  it("reads the invoice id, the flag and the reasons of the event from the local database, by the event's id", () => {
    reasonsOf(row());

    expect(mocks.compiled?.sql).toContain('"Events"');
    expect(mocks.compiled?.sql).toContain("qbo_invoice_id");
    expect(mocks.compiled?.sql).toContain("qbo_invoice_mismatch");
    expect(mocks.compiled?.sql).toContain("qbo_invoice_mismatch_reasons");
    expect(mocks.compiled?.parameters).toContain("evt-1");
  });

  it("returns the reasons of the rule for the local row", () => {
    expect(reasonsOf(row({ qbo_invoice_mismatch_reasons: '["totals","dates"]' }))).toEqual([
      "dates",
      "totals",
    ]);
  });

  it("a set flag with no reasons is the generic reason", () => {
    expect(reasonsOf(row({ qbo_invoice_mismatch_reasons: null }))).toEqual(["unspecified"]);
  });

  it("a clear flag, or a quote with no invoice, gives none", () => {
    expect(reasonsOf(row({ qbo_invoice_mismatch: 0 }))).toEqual([]);
    expect(reasonsOf(row({ qbo_invoice_id: null }))).toEqual([]);
  });

  it("an event that has not reached the local database yet gives none", () => {
    expect(reasonsOf(null)).toEqual([]);
  });

  it("follows a change of the local row: once the new flag syncs, the reasons are gone", () => {
    expect(reasonsOf(row())).toEqual(["dates"]);
    expect(reasonsOf(row({ qbo_invoice_mismatch: 0, qbo_invoice_mismatch_reasons: null }))).toEqual(
      [],
    );
  });
});
