import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getMessageSummary,
  listLatestMessages,
  listMessageIds,
  summarizeMessage,
} from "./gmailMessages";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("summarizeMessage", () => {
  it("reads the headers regardless of case, plus the date and labels", () => {
    expect(
      summarizeMessage({
        id: "m1",
        threadId: "t1",
        snippet: "Hello there",
        internalDate: "1761490800000",
        labelIds: ["INBOX", "UNREAD"],
        payload: {
          headers: [
            { name: "from", value: "Pat <pat@example.com>" },
            { name: "TO", value: "me@example.com" },
            { name: "Cc", value: "boss@example.com" },
            { name: "SUBJECT", value: "Quote" },
            { name: "Date", value: "Mon, 26 Oct 2026 09:00:00 -0600" },
            { name: "message-id", value: "<abc@mail.example.com>" },
          ],
        },
      }),
    ).toEqual({
      id: "m1",
      threadId: "t1",
      messageId: "<abc@mail.example.com>",
      from: "Pat <pat@example.com>",
      to: "me@example.com",
      cc: "boss@example.com",
      subject: "Quote",
      date: "Mon, 26 Oct 2026 09:00:00 -0600",
      snippet: "Hello there",
      internalDate: 1761490800000,
      labelIds: ["INBOX", "UNREAD"],
    });
  });

  it("returns nulls and empty values for anything missing", () => {
    const summary = summarizeMessage({ id: "m2", threadId: "t2" });

    expect(summary).toMatchObject({
      messageId: null,
      from: null,
      to: null,
      cc: null,
      subject: null,
      date: null,
      snippet: "",
      internalDate: null,
      labelIds: [],
    });
  });
});

describe("listMessageIds", () => {
  it("sends the search and page size, and returns ids with whether there are more", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "next" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await listMessageIds("ya29.token", "from:pat@xyz.com", 50);

    expect(out).toEqual({ ids: ["a", "b"], hasMore: true });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("q")).toBe("from:pat@xyz.com");
    expect(url.searchParams.get("maxResults")).toBe("50");
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: "Bearer ya29.token" } });
  });

  it("omits q when there is no query, and reports no more pages", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "a" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await listMessageIds("t", undefined, 5);

    expect(out).toEqual({ ids: ["a"], hasMore: false });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has("q")).toBe(false);
  });

  it("returns no ids for an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );

    expect(await listMessageIds("t", "from:nobody@xyz.com", 5)).toEqual({
      ids: [],
      hasMore: false,
    });
  });
});

describe("getMessageSummary", () => {
  it("asks for metadata only, with just the headers it needs", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "a", threadId: "t" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getMessageSummary("t", "a");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/messages\/a$/);
    expect(url.searchParams.get("format")).toBe("metadata");
    expect(url.searchParams.getAll("metadataHeaders")).toEqual([
      "From",
      "To",
      "Cc",
      "Subject",
      "Date",
      "Message-ID",
    ]);
  });
});

describe("listLatestMessages", () => {
  it("lists the ids, fetches each message's headers, and sends the bearer token", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const json = url.includes("/messages?maxResults=2")
        ? { messages: [{ id: "a" }, { id: "b" }] }
        : {
            id: url.includes("/messages/a?") ? "a" : "b",
            threadId: "t",
            payload: { headers: [{ name: "Subject", value: "Quote" }] },
          };
      return { ok: true, status: 200, json: async () => json };
    });
    vi.stubGlobal("fetch", fetchMock);

    const messages = await listLatestMessages("ya29.token", 2);

    expect(messages.map((m) => [m.id, m.subject])).toEqual([
      ["a", "Quote"],
      ["b", "Quote"],
    ]);
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: "Bearer ya29.token" } });
  });

  it("returns an empty list for an empty mailbox", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );

    expect(await listLatestMessages("t", 5)).toEqual([]);
  });

  it("surfaces Gmail's error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => ({ error: { message: "Insufficient Permission" } }),
      })),
    );

    await expect(listLatestMessages("t", 5)).rejects.toThrow(
      "Gmail API 403: Insufficient Permission",
    );
  });
});
