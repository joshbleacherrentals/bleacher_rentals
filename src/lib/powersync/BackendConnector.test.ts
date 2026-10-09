import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { client, toast } = vi.hoisted(() => ({
  client: {
    // What the next Supabase call resolves to, or throws.
    result: { error: null } as { error: unknown },
    thrown: null as unknown,
    from: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => client,
}));

vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToastNoThrow: toast,
}));

import { UpdateType } from "@powersync/web";
import { resetEventContextForTests } from "@/lib/perf/eventContext";
import { setMetricsSink } from "@/lib/perf/metrics";
import type { PerfEvent } from "@/lib/perf/telemetryEvent";
import { credentialsFetchedWithin, resetSyncObserverForTests } from "./syncObserver";
import { BackendConnector, joinTables, resetCredentialsCacheForTests } from "./BackendConnector";

const TOKEN_SECRET = "SECRET_SIGNATURE_PART";

function jwt(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds })).replace(/=/g, "");
  return `header.${payload}.${TOKEN_SECRET}`;
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

let events: PerfEvent[];

function fetchReturning(response: unknown) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const okResponse = (token = jwt(inAnHour())) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ endpoint: "https://ps.example", token }),
  text: () => Promise.resolve(""),
});

beforeEach(() => {
  events = [];
  resetEventContextForTests();
  resetSyncObserverForTests();
  resetCredentialsCacheForTests();
  setMetricsSink((event) => events.push(event));
  toast.mockReset();
  client.result = { error: null };
  client.thrown = null;
  client.from.mockReset();
  client.from.mockImplementation(() => {
    const respond = () => {
      if (client.thrown) return Promise.reject(client.thrown);
      return Promise.resolve(client.result);
    };
    return {
      upsert: respond,
      update: () => ({ eq: respond }),
      delete: () => ({ eq: respond }),
    };
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setMetricsSink(null);
});

const names = () => events.map((e) => e.name);

// ---------------------------------------------------------------------------
// powersync.credentials
// ---------------------------------------------------------------------------

describe("fetchCredentials", () => {
  it("records a network fetch, then a cache hit", async () => {
    fetchReturning(okResponse());
    const connector = new BackendConnector(null);

    await connector.fetchCredentials();
    await connector.fetchCredentials();

    expect(names()).toEqual(["powersync.credentials", "powersync.credentials"]);
    expect(events.map((e) => e.attrs)).toEqual([{ source: "network" }, { source: "cache" }]);
    expect(events.every((e) => e.outcome === "ok")).toBe(true);
    expect(events.every((e) => typeof e.durationMs === "number")).toBe(true);
  });

  it("records a call made while another is in flight as shared", async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );

    const connector = new BackendConnector(null);
    const first = connector.fetchCredentials();
    const second = connector.fetchCredentials();
    finish(okResponse());
    await Promise.all([first, second]);

    expect(events.map((e) => e.attrs?.source).sort()).toEqual(["network", "shared"]);
  });

  it("still returns the same credentials as before", async () => {
    const token = jwt(inAnHour());
    fetchReturning(okResponse(token));
    const credentials = await new BackendConnector(null).fetchCredentials();
    expect(credentials).toEqual({ endpoint: "https://ps.example", token });
  });

  it("records an error with a classified kind and never the response text", async () => {
    fetchReturning({
      ok: false,
      status: 503,
      text: () => Promise.resolve('{"row":"person@example.com"}'),
    });

    await expect(new BackendConnector(null).fetchCredentials()).rejects.toThrow();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "error", errorKind: "http_5xx" });
    expect(JSON.stringify(events)).not.toContain("person@example.com");
  });

  it("records a fetch that cannot reach the server as a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(new BackendConnector(null).fetchCredentials()).rejects.toThrow();
    expect(events[0]).toMatchObject({ outcome: "error", errorKind: "network" });
  });

  it("never lets the token, or any part of it, into an event", async () => {
    const token = jwt(inAnHour());
    fetchReturning(okResponse(token));
    const connector = new BackendConnector(null);
    await connector.fetchCredentials();
    await connector.fetchCredentials();

    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain(TOKEN_SECRET);
    expect(serialised).not.toContain("ps.example");
  });

  it("marks a network fetch on the credentials clock, which spec 2 reads for `planned`", async () => {
    fetchReturning(okResponse());
    expect(credentialsFetchedWithin(1000)).toBe(false);
    await new BackendConnector(null).fetchCredentials();
    expect(credentialsFetchedWithin(1000)).toBe(true);
  });

  it("does not mark the clock when the fetch failed", async () => {
    fetchReturning({ ok: false, status: 500, text: () => Promise.resolve("x") });
    await expect(new BackendConnector(null).fetchCredentials()).rejects.toThrow();
    expect(credentialsFetchedWithin(1000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sync.upload
// ---------------------------------------------------------------------------

type Op = { op: UpdateType; table: string; id: string; opData?: Record<string, unknown> };

function databaseWith(crud: Op[] | null) {
  const complete = vi.fn(() => Promise.resolve());
  const transaction = crud ? { crud, complete } : null;
  return {
    database: { getNextCrudTransaction: vi.fn(() => Promise.resolve(transaction)) },
    complete,
  };
}

const put = (table: string, id = "1"): Op => ({
  op: UpdateType.PUT,
  table,
  id,
  opData: { name: "n" },
});

describe("uploadData", () => {
  it("records nothing for an empty queue", async () => {
    const { database } = databaseWith(null);
    await new BackendConnector(null).uploadData(database as never);
    expect(events).toEqual([]);
  });

  it("records a successful transaction with its size and tables", async () => {
    const { database, complete } = databaseWith([
      put("Events"),
      put("Events", "2"),
      put("Addresses"),
    ]);
    await new BackendConnector(null).uploadData(database as never);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sync.upload", outcome: "ok", errorKind: null });
    expect(events[0].attrs).toEqual({ ops: 3, tables: "Addresses,Events" });
    expect(typeof events[0].durationMs).toBe("number");
  });

  it.each(["23505", "42501", "23514"])(
    "a fatal code %s records pg:<code> with discarded, and still shows the toast",
    async (code) => {
      client.result = { error: { code, message: "refused" } };
      const { database, complete } = databaseWith([put("PaymentHistory")]);

      await new BackendConnector(null).uploadData(database as never);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        outcome: "error",
        errorKind: `pg:${code}`,
      });
      expect(events[0].attrs).toMatchObject({ discarded: true, ops: 1 });
      expect(toast).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );

  it("records the discard even when completing the transaction fails", async () => {
    client.result = { error: { code: "23505", message: "dup" } };
    const { database, complete } = databaseWith([put("Events")]);
    complete.mockRejectedValueOnce(new Error("could not complete"));

    await expect(new BackendConnector(null).uploadData(database as never)).rejects.toThrow();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ errorKind: "pg:23505", outcome: "error" });
  });

  it("a network error is recorded, thrown for a retry, and the transaction stays queued", async () => {
    client.thrown = new TypeError("Failed to fetch");
    const { database, complete } = databaseWith([put("Events")]);

    await expect(new BackendConnector(null).uploadData(database as never)).rejects.toThrow();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "error", errorKind: "network" });
    expect(events[0].attrs).not.toHaveProperty("discarded");
    expect(complete).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("every retry is its own event", async () => {
    client.thrown = new TypeError("Failed to fetch");
    const connector = new BackendConnector(null);
    const { database } = databaseWith([put("Events")]);

    await expect(connector.uploadData(database as never)).rejects.toThrow();
    await expect(connector.uploadData(database as never)).rejects.toThrow();
    await expect(connector.uploadData(database as never)).rejects.toThrow();
    expect(events).toHaveLength(3);
  });

  it("never lets a row from a Supabase error message reach an event", async () => {
    client.result = {
      error: { code: "23505", message: '{"email":"person@example.com","amount":1200}' },
    };
    const { database } = databaseWith([put("Events")]);
    await new BackendConnector(null).uploadData(database as never);

    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain("person@example.com");
    expect(serialised).not.toContain("1200");
  });

  it("never lets operation data or ids into an event", async () => {
    const { database } = databaseWith([
      { op: UpdateType.PUT, table: "Contacts", id: "row-id-123", opData: { email: "a@b.c" } },
    ]);
    await new BackendConnector(null).uploadData(database as never);

    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain("a@b.c");
    expect(serialised).not.toContain("row-id-123");
  });

  it("records no byte count or estimate (the user's decision D1)", async () => {
    const { database } = databaseWith([put("Events")]);
    await new BackendConnector(null).uploadData(database as never);

    const keys = Object.keys(events[0].attrs ?? {});
    expect(keys.filter((key) => /byte|size|length/i.test(key))).toEqual([]);
  });

  it("covers update and delete as well as put", async () => {
    const { database } = databaseWith([
      { op: UpdateType.PATCH, table: "Events", id: "1", opData: { name: "x" } },
      { op: UpdateType.DELETE, table: "Events", id: "2" },
    ]);
    await new BackendConnector(null).uploadData(database as never);
    expect(events[0].attrs).toEqual({ ops: 2, tables: "Events" });
  });
});

describe("joinTables", () => {
  it("lists each table once, sorted", () => {
    expect(joinTables(["b", "a", "b", "a"])).toBe("a,b");
  });

  it("is empty for no tables", () => {
    expect(joinTables([])).toBe("");
  });

  it("truncates to the attrs string cap of 64 characters", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Table${String(i).padStart(2, "0")}Name`);
    const joined = joinTables(many);
    expect(joined.length).toBeLessThanOrEqual(64);
    expect(joined.startsWith("Table00Name,Table01Name")).toBe(true);
  });
});
