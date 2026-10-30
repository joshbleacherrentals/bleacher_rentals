import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getAttachmentData,
  getFullMessage,
  getMessageSummary,
  GmailApiError,
  getProfileHistoryId,
  listHistory,
  listLatestMessages,
  listMessageIds,
  sendRawMessage,
  summarizeMessage,
  watchMailbox,
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
            { name: "IN-REPLY-TO", value: "<prev@mail.example.com>" },
            { name: "References", value: "<first@mail.example.com> <prev@mail.example.com>" },
          ],
        },
      }),
    ).toEqual({
      id: "m1",
      threadId: "t1",
      messageId: "<abc@mail.example.com>",
      inReplyTo: "<prev@mail.example.com>",
      references: "<first@mail.example.com> <prev@mail.example.com>",
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
      inReplyTo: null,
      references: null,
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
      "In-Reply-To",
      "References",
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

describe("getFullMessage", () => {
  it("asks for the whole message and sends the bearer token", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "abc123", threadId: "t", payload: { mimeType: "text/plain" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const message = await getFullMessage("ya29.token", "abc123");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/messages\/abc123$/);
    expect(url.searchParams.get("format")).toBe("full");
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: "Bearer ya29.token" } });
    expect(message.id).toBe("abc123");
  });

  it("throws an error that carries Gmail's status, so a missing email is told apart from a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: { message: "Requested entity was not found." } }),
      })),
    );

    const error = await getFullMessage("t", "nope").catch((e) => e);

    expect(error).toBeInstanceOf(GmailApiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe("Gmail API 404: Requested entity was not found.");
  });
});

describe("getAttachmentData", () => {
  it("fetches one attachment of one message and returns its base64url data", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ size: 3, data: "SGkh" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getAttachmentData("t", "msg1", "ATT/1")).toBe("SGkh");
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toMatch(
      /\/messages\/msg1\/attachments\/ATT%2F1$/,
    );
  });

  it("returns an empty string when Gmail sends no data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );

    expect(await getAttachmentData("t", "m", "a")).toBe("");
  });
});

describe("sendRawMessage", () => {
  it("posts the message to Gmail as the mailbox the token acts as, and returns the new ids", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "sent1", threadId: "thread1", labelIds: ["SENT"] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendRawMessage("ya29.token", "cmF3");

    expect(sent).toEqual({ id: "sent1", threadId: "thread1", labelIds: ["SENT"] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toMatch(/\/users\/me\/messages\/send$/);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer ya29.token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({ raw: "cmF3" });
  });

  it("puts the message in a thread only when it is given one", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "sent1", threadId: "t9" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendRawMessage("t", "cmF3", "t9");

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      raw: "cmF3",
      threadId: "t9",
    });
  });

  it("surfaces Gmail's refusal with its status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: async () => ({ error: { message: "Insufficient Permission" } }),
      })),
    );

    const error = await sendRawMessage("t", "cmF3").catch((e) => e);

    expect(error).toBeInstanceOf(GmailApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe("Gmail API 403: Insufficient Permission");
  });
});

describe("listHistory", () => {
  const okJson = (body: unknown) =>
    vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => body,
    }));

  it("asks for what was added since a history id and lists the messages with their labels", async () => {
    const fetchMock = okJson({
      history: [
        { id: "101", messagesAdded: [{ message: { id: "a1", labelIds: ["INBOX"] } }] },
        { id: "102", messagesAdded: [{ message: { id: "b2" } }, { message: { id: "c3" } }] },
        { id: "103" },
      ],
      historyId: "150",
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await listHistory("ya29.token", "100");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/users\/me\/history$/);
    expect(url.searchParams.get("startHistoryId")).toBe("100");
    expect(url.searchParams.get("historyTypes")).toBe("messageAdded");
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: "Bearer ya29.token" } });
    expect(page).toEqual({
      added: [
        { id: "a1", labelIds: ["INBOX"] },
        { id: "b2", labelIds: [] },
        { id: "c3", labelIds: [] },
      ],
      lastRecordId: "103",
      historyId: "150",
      nextPageToken: null,
    });
  });

  it("passes on a page token and reports the next one", async () => {
    const fetchMock = okJson({ history: [], nextPageToken: "next-1", historyId: "9" });
    vi.stubGlobal("fetch", fetchMock);

    const page = await listHistory("t", "5", "page-2");

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("pageToken")).toBe("page-2");
    expect(page).toMatchObject({ added: [], lastRecordId: null, nextPageToken: "next-1" });
  });

  it("is empty, with the current history id, when nothing changed", async () => {
    vi.stubGlobal("fetch", okJson({ historyId: "77" }));

    expect(await listHistory("t", "77")).toEqual({
      added: [],
      lastRecordId: null,
      historyId: "77",
      nextPageToken: null,
    });
  });

  it("throws a 404 GmailApiError for a history id Gmail no longer keeps", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: { message: "Requested entity was not found." } }),
      })),
    );

    const error = await listHistory("t", "1").catch((e) => e);

    expect(error).toBeInstanceOf(GmailApiError);
    expect(error.status).toBe(404);
  });
});

describe("getProfileHistoryId", () => {
  it("reads the mailbox's current history id", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ emailAddress: "a@b.com", historyId: "4242" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await getProfileHistoryId("t")).toBe("4242");
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toMatch(/\/users\/me\/profile$/);
  });
});

describe("watchMailbox", () => {
  it("asks Gmail to publish Inbox and Sent changes to the topic, and returns the history id and expiry", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ historyId: "900", expiration: "1762000000000" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const watch = await watchMailbox("ya29.token", "projects/p/topics/gmail-mailbox-changes");

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toMatch(/\/users\/me\/watch$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      topicName: "projects/p/topics/gmail-mailbox-changes",
      labelIds: ["INBOX", "SENT"],
      labelFilterBehavior: "INCLUDE",
    });
    expect(watch).toEqual({ historyId: "900", expiresAt: new Date(1762000000000) });
  });
});
