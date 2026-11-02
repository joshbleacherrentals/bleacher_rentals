import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";

// Spec: docs/specs/accountant-collections-15-open-pdf.md §3 and §5.
//
// The query runs on a real SQLite, so "active only", "the newest" and "an empty path as such" are
// checked on rows and not on the SQL text. The hook is rendered on the server with `useTypedQuery`
// replaced, which is enough for what it decides: the shape it gives back. The same pattern as
// `useContractSignature.test.tsx`.

const mocks = vi.hoisted(() => ({
  answer: { data: [], isLoading: false } as { data: unknown[]; isLoading: boolean },
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
  useTypedQuery: () => mocks.answer,
}));

import { buildSignedPdfQuery, useSignedPdf } from "./useSignedPdf";

const compileOnlyDb = new Kysely<PowerSyncDB>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

// [id, event_uuid, signed_at, status, signed_pdf_path]
function seed(rows: Array<[string, string, string, string, string | null]>) {
  const db = new DatabaseSync(":memory:");
  db.exec(`create table "ContractSignatures" (id text primary key, event_uuid text,
    signed_at text, status text, signed_pdf_path text)`);
  for (const row of rows) {
    db.prepare(`insert into "ContractSignatures" values (?, ?, ?, ?, ?)`).run(...row);
  }
  return db;
}

function rowsOf(db: DatabaseSync, eventId: string) {
  const compiled = buildSignedPdfQuery(compileOnlyDb, eventId);
  return db.prepare(compiled.sql).all(...(compiled.parameters as SQLInputValue[]));
}

describe("buildSignedPdfQuery", () => {
  it("returns the stored PDF path of the event's active signature", () => {
    const db = seed([["s1", "ev-1", "2026-05-01T10:00:00Z", "active", "ev-1/s1.pdf"]]);
    expect(rowsOf(db, "ev-1")).toEqual([{ signed_pdf_path: "ev-1/s1.pdf" }]);
  });

  it("returns only the newest when two are active", () => {
    const db = seed([
      ["old", "ev-1", "2026-05-01T10:00:00Z", "active", "ev-1/old.pdf"],
      ["new", "ev-1", "2026-05-02T10:00:00Z", "active", "ev-1/new.pdf"],
    ]);
    expect(rowsOf(db, "ev-1")).toEqual([{ signed_pdf_path: "ev-1/new.pdf" }]);
  });

  it("ignores an invalidated signature: the quote is no longer what was signed", () => {
    const db = seed([["s1", "ev-1", "2026-05-01T10:00:00Z", "invalidated", "ev-1/s1.pdf"]]);
    expect(rowsOf(db, "ev-1")).toEqual([]);
  });

  it("prefers an older active signature to a newer invalidated one", () => {
    const db = seed([
      ["active", "ev-1", "2026-05-01T10:00:00Z", "active", "ev-1/active.pdf"],
      ["dead", "ev-1", "2026-05-02T10:00:00Z", "invalidated", "ev-1/dead.pdf"],
    ]);
    expect(rowsOf(db, "ev-1")).toEqual([{ signed_pdf_path: "ev-1/active.pdf" }]);
  });

  it("does not return another event's signature", () => {
    const db = seed([["s1", "ev-2", "2026-05-01T10:00:00Z", "active", "ev-2/s1.pdf"]]);
    expect(rowsOf(db, "ev-1")).toEqual([]);
  });

  it("returns an empty or missing path as it is, so the signature still counts as the newest", () => {
    const empty = seed([["s1", "ev-1", "2026-05-01T10:00:00Z", "active", ""]]);
    expect(rowsOf(empty, "ev-1")).toEqual([{ signed_pdf_path: "" }]);

    const missing = seed([["s1", "ev-1", "2026-05-01T10:00:00Z", "active", null]]);
    expect(rowsOf(missing, "ev-1")).toEqual([{ signed_pdf_path: null }]);
  });

  it("does not fall back to an older PDF when the newest signature has none", () => {
    const db = seed([
      ["old", "ev-1", "2026-05-01T10:00:00Z", "active", "ev-1/old.pdf"],
      ["new", "ev-1", "2026-05-02T10:00:00Z", "active", ""],
    ]);
    expect(rowsOf(db, "ev-1")).toEqual([{ signed_pdf_path: "" }]);
  });
});

function Probe() {
  return <pre>{JSON.stringify(useSignedPdf("ev-1"))}</pre>;
}

function read() {
  const html = renderToStaticMarkup(<Probe />);
  const json = html
    .replace(/^<pre>/, "")
    .replace(/<\/pre>$/, "")
    .replaceAll("&quot;", '"');
  return JSON.parse(json) as { signedPdfPath: string | null; isLoading: boolean };
}

describe("useSignedPdf", () => {
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false };
  });

  it("gives the path of the row", () => {
    mocks.answer = { data: [{ signed_pdf_path: "ev-1/s1.pdf" }], isLoading: false };
    expect(read()).toEqual({ signedPdfPath: "ev-1/s1.pdf", isLoading: false });
  });

  it("gives no path when there is no active signature", () => {
    expect(read()).toEqual({ signedPdfPath: null, isLoading: false });
  });

  it("passes an empty path through as it is", () => {
    mocks.answer = { data: [{ signed_pdf_path: "" }], isLoading: false };
    expect(read().signedPdfPath).toBe("");
  });

  it("gives null for a row that arrived without a path", () => {
    mocks.answer = { data: [{ signed_pdf_path: null }], isLoading: false };
    expect(read().signedPdfPath).toBeNull();
  });

  it("passes the loading state through, with no path yet", () => {
    mocks.answer = { data: [], isLoading: true };
    expect(read()).toEqual({ signedPdfPath: null, isLoading: true });
  });
});
