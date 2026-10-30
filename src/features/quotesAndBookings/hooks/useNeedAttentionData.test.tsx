import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/qbo-invoice-10-need-attention-tab.md §3 and §8. The hook is rendered on the server
// with `useTypedQuery` replaced: what is under test is the query it asks the local database, and that
// it hands back what the database answered.

const mocks = vi.hoisted(() => ({
  answer: { data: [], isLoading: false, error: undefined } as {
    data: unknown[] | undefined;
    isLoading: boolean;
    error: Error | undefined;
  },
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

import { useNeedAttentionData } from "./useNeedAttentionData";

function Probe() {
  const { data, isLoading } = useNeedAttentionData();
  return <p>{JSON.stringify({ data, isLoading })}</p>;
}

const drawn = () =>
  JSON.parse(
    renderToStaticMarkup(<Probe />)
      .replace(/<\/?p>/g, "")
      .replaceAll("&quot;", '"'),
  );

describe("useNeedAttentionData", () => {
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false, error: undefined };
    mocks.compiled = undefined;
  });

  it("reads the four columns from Events", () => {
    drawn();

    const sql = mocks.compiled?.sql ?? "";
    expect(sql).toContain('from "Events"');
    for (const column of [
      '"id"',
      '"qbo_invoice_id"',
      '"qbo_invoice_mismatch"',
      '"qbo_invoice_mismatch_reasons"',
    ]) {
      expect(sql).toContain(column);
    }
    // Not the invoice's other columns, and not the event's.
    expect(sql).not.toContain("qbo_invoice_checked_at");
    expect(sql).not.toContain("event_name");
  });

  it("asks only for events that have an invoice and whose flag is set", () => {
    drawn();

    expect(mocks.compiled?.sql).toContain('"qbo_invoice_id" is not null');
    expect(mocks.compiled?.sql).toContain('"qbo_invoice_mismatch" = ?');
    expect(mocks.compiled?.parameters).toEqual([1]);
  });

  it("has no join: one query per table", () => {
    drawn();

    expect(mocks.compiled?.sql).not.toMatch(/\bjoin\b/i);
  });

  it("hands back the rows the local database answered", () => {
    const row = {
      id: "evt-1",
      qbo_invoice_id: "inv-1",
      qbo_invoice_mismatch: 1,
      qbo_invoice_mismatch_reasons: '["dates"]',
    };
    mocks.answer = { data: [row], isLoading: false, error: undefined };

    expect(drawn()).toEqual({ data: [row], isLoading: false });
  });

  it("says it is loading until the local database has answered", () => {
    mocks.answer = { data: undefined, isLoading: true, error: undefined };

    expect(drawn().isLoading).toBe(true);
  });
});
