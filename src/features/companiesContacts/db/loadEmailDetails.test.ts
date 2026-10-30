import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

let savedDetails: { id: string }[];
const batches: CompiledQuery[][] = [];

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: async () => savedDetails,
  typedExecuteBatch: async (statements: CompiledQuery[]) => {
    batches.push(statements);
  },
}));

import { loadEmailDetails, saveEmailDetails } from "./loadEmailDetails";

const fetchReturning = (status: number, body: unknown) =>
  vi.fn(async (_url: string) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));

beforeEach(() => {
  savedDetails = [];
  batches.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveEmailDetails", () => {
  it("inserts the details row, then points the email at it, in one transaction", async () => {
    const id = await saveEmailDetails({
      emailMessageUuid: "msg-1",
      bodyText: "Hello",
      bodyHtml: "<p>Hello</p>",
    });

    expect(batches).toHaveLength(1);
    const [insert, update] = batches[0];
    expect(insert.sql).toMatch(/^insert into "EmailMessageDetails"/);
    expect(insert.parameters).toContain(id);
    expect(insert.parameters).toContain("msg-1");
    expect(insert.parameters).toContain("Hello");
    expect(insert.parameters).toContain("<p>Hello</p>");

    expect(update.sql).toBe(
      'update "EmailMessages" set "email_message_details_uuid" = ? where "id" = ?',
    );
    expect(update.parameters).toEqual([id, "msg-1"]);
  });

  it("saves a missing body as null", async () => {
    await saveEmailDetails({ emailMessageUuid: "msg-1", bodyText: null, bodyHtml: null });

    expect(batches[0][0].parameters.filter((p) => p === null)).toHaveLength(2);
  });
});

describe("loadEmailDetails", () => {
  const params = {
    emailMessageUuid: "msg-1",
    mailbox: "paul@co.com",
    googleId: "1a15f4ce83c6ef44",
  };

  it("reads the email as that mailbox from the endpoint and saves its body", async () => {
    const fetchMock = fetchReturning(200, { text: "Hi", html: "<b>Hi</b>" });
    vi.stubGlobal("fetch", fetchMock);

    await loadEmailDetails(params);

    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.pathname).toBe("/api/gmail/email");
    expect(url.searchParams.get("mailbox")).toBe("paul@co.com");
    expect(url.searchParams.get("id")).toBe("1a15f4ce83c6ef44");
    expect(batches[0][0].parameters).toContain("Hi");
    expect(batches[0][0].parameters).toContain("<b>Hi</b>");
  });

  it("does nothing when the details are already saved", async () => {
    savedDetails = [{ id: "details-1" }];
    const fetchMock = fetchReturning(200, { text: "x", html: null });
    vi.stubGlobal("fetch", fetchMock);

    await loadEmailDetails(params);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(batches).toEqual([]);
  });

  it("throws the endpoint's message and saves nothing when the email cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      fetchReturning(404, { error: "That mailbox has no email with that id" }),
    );

    await expect(loadEmailDetails(params)).rejects.toThrow(
      "That mailbox has no email with that id",
    );
    expect(batches).toEqual([]);
  });

  it("falls back to a generic message when the response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      })),
    );

    await expect(loadEmailDetails(params)).rejects.toThrow("Could not load the email (502).");
  });

  it("saves an email with no body as null text and html", async () => {
    vi.stubGlobal("fetch", fetchReturning(200, { text: null, html: null }));

    await loadEmailDetails(params);

    expect(batches).toHaveLength(1);
  });

  it("loads an email once when it is asked for twice at the same time", async () => {
    const fetchMock = fetchReturning(200, { text: "Hi", html: null });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([loadEmailDetails(params), loadEmailDetails(params)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(batches).toHaveLength(1);
  });

  it("can load again once the first load is over, and after one that failed", async () => {
    vi.stubGlobal("fetch", fetchReturning(500, { error: "boom" }));
    await expect(loadEmailDetails(params)).rejects.toThrow("boom");

    const fetchMock = fetchReturning(200, { text: "Hi", html: null });
    vi.stubGlobal("fetch", fetchMock);
    await loadEmailDetails(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(batches).toHaveLength(1);
  });
});
