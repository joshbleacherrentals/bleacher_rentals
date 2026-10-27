import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listLatestMessages, summarizeMessage } from "./gmailMessages";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("summarizeMessage", () => {
  it("reads From, Subject and Date headers regardless of case", () => {
    expect(
      summarizeMessage({
        id: "m1",
        threadId: "t1",
        snippet: "Hello there",
        payload: {
          headers: [
            { name: "from", value: "Pat <pat@example.com>" },
            { name: "SUBJECT", value: "Quote" },
            { name: "Date", value: "Mon, 26 Oct 2026 09:00:00 -0600" },
          ],
        },
      }),
    ).toEqual({
      id: "m1",
      threadId: "t1",
      from: "Pat <pat@example.com>",
      subject: "Quote",
      date: "Mon, 26 Oct 2026 09:00:00 -0600",
      snippet: "Hello there",
    });
  });

  it("returns nulls for missing headers", () => {
    const summary = summarizeMessage({ id: "m2", threadId: "t2" });

    expect(summary).toMatchObject({ from: null, subject: null, date: null, snippet: "" });
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
