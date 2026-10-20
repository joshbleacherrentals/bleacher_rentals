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

// Spec: docs/specs/quote-detail-02-contract-signature.md §3 and §7 (test 1).
//
// The query is run on a real SQLite, so "active only" and "the newest" are checked on rows and not
// on the SQL text. The hook is rendered on the server with `useTypedQuery` replaced, which is
// enough for what it decides: when to say there is no signature, and what shape to give it.

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

import { buildContractSignatureQuery, useContractSignature } from "./useContractSignature";

const compileOnlyDb = new Kysely<PowerSyncDB>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

function seed(rows: Array<[string, string, string, string, string]>) {
  const db = new DatabaseSync(":memory:");
  db.exec(`create table "ContractSignatures" (id text primary key, event_uuid text,
    signer_name text, signed_at text, status text)`);
  for (const row of rows) {
    db.prepare(`insert into "ContractSignatures" values (?, ?, ?, ?, ?)`).run(...row);
  }
  return db;
}

function signaturesOf(db: DatabaseSync, eventId: string) {
  const compiled = buildContractSignatureQuery(compileOnlyDb, eventId);
  return db.prepare(compiled.sql).all(...(compiled.parameters as SQLInputValue[]));
}

describe("buildContractSignatureQuery", () => {
  it("returns the active signature of the event", () => {
    const db = seed([["s1", "ev-1", "Dana Whitfield", "2026-05-01T10:00:00Z", "active"]]);
    expect(signaturesOf(db, "ev-1")).toEqual([
      { id: "s1", signer_name: "Dana Whitfield", signed_at: "2026-05-01T10:00:00Z" },
    ]);
  });

  it("does not return a signature that was invalidated", () => {
    const db = seed([["s1", "ev-1", "Dana Whitfield", "2026-05-01T10:00:00Z", "invalidated"]]);
    expect(signaturesOf(db, "ev-1")).toEqual([]);
  });

  it("does not return another event's signature", () => {
    const db = seed([["s1", "ev-2", "Dana Whitfield", "2026-05-01T10:00:00Z", "active"]]);
    expect(signaturesOf(db, "ev-1")).toEqual([]);
  });

  it("returns only the newest when two are active", () => {
    const db = seed([
      ["old", "ev-1", "First Signer", "2026-05-01T10:00:00Z", "active"],
      ["new", "ev-1", "Second Signer", "2026-05-02T10:00:00Z", "active"],
    ]);
    expect(signaturesOf(db, "ev-1")).toEqual([
      { id: "new", signer_name: "Second Signer", signed_at: "2026-05-02T10:00:00Z" },
    ]);
  });

  it("prefers an older active signature to a newer invalidated one", () => {
    const db = seed([
      ["active", "ev-1", "First Signer", "2026-05-01T10:00:00Z", "active"],
      ["dead", "ev-1", "Second Signer", "2026-05-02T10:00:00Z", "invalidated"],
    ]);
    expect(signaturesOf(db, "ev-1").map((r) => (r as { id: string }).id)).toEqual(["active"]);
  });
});

function Probe({ hasTerms }: { hasTerms: boolean }) {
  const { signature, isLoading } = useContractSignature("ev-1", hasTerms);
  return <pre>{JSON.stringify({ signature, isLoading })}</pre>;
}

function read(hasTerms: boolean) {
  const html = renderToStaticMarkup(<Probe hasTerms={hasTerms} />);
  const json = html
    .replace(/^<pre>/, "")
    .replace(/<\/pre>$/, "")
    .replaceAll("&quot;", '"');
  return JSON.parse(json) as {
    signature: { signerName: string; signedAt: string } | null;
    isLoading: boolean;
  };
}

describe("useContractSignature", () => {
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false };
  });

  it("gives the signer and the time of the row", () => {
    mocks.answer = {
      data: [{ id: "s1", signer_name: "Dana Whitfield", signed_at: "2026-05-01T10:00:00Z" }],
      isLoading: false,
    };
    expect(read(true).signature).toEqual({
      signerName: "Dana Whitfield",
      signedAt: "2026-05-01T10:00:00Z",
    });
  });

  it("gives no signature when there is no row", () => {
    expect(read(true).signature).toBeNull();
  });

  it("gives no signature when the event has no terms, even if a row exists", () => {
    // The old route answered `signature: null` for an event without terms.
    mocks.answer = {
      data: [{ id: "s1", signer_name: "Dana Whitfield", signed_at: "2026-05-01T10:00:00Z" }],
      isLoading: false,
    };
    expect(read(false).signature).toBeNull();
  });

  it("passes the loading state through, with no signature yet", () => {
    mocks.answer = { data: [], isLoading: true };
    expect(read(true)).toEqual({ signature: null, isLoading: true });
  });

  it("keeps a missing name or time as an empty string instead of failing", () => {
    mocks.answer = { data: [{ id: "s1", signer_name: null, signed_at: null }], isLoading: false };
    expect(read(true).signature).toEqual({ signerName: "", signedAt: "" });
  });
});
