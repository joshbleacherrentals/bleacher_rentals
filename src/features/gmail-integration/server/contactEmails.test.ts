import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getDelegatedAccessToken = vi.fn();
vi.mock("./delegatedAuth", () => ({
  GMAIL_READONLY_SCOPE: "readonly-scope",
  getDelegatedAccessToken: (args: unknown) => getDelegatedAccessToken(args),
}));

const listMessageIds = vi.fn();
const getMessageSummary = vi.fn();
vi.mock("./gmailMessages", () => ({
  listMessageIds: (...args: unknown[]) => listMessageIds(...args),
  getMessageSummary: (...args: unknown[]) => getMessageSummary(...args),
}));

import {
  buildContactEmailQuery,
  clampLimit,
  isSafeSearchAddress,
  isValidDateBound,
  mergeMailboxMessages,
  pullContactEmails,
} from "./contactEmails";

const message = (
  over: Partial<Parameters<typeof mergeMailboxMessages>[0][0]["messages"][0]> = {},
) => ({
  id: "g1",
  threadId: "t1",
  messageId: "<m1@x>",
  from: "a@x.com",
  to: "b@x.com",
  cc: null,
  subject: "Hi",
  date: null,
  snippet: "",
  internalDate: 1000,
  labelIds: ["INBOX"],
  ...over,
});

describe("buildContactEmailQuery", () => {
  it("matches the address in from, to, cc and bcc", () => {
    expect(buildContactEmailQuery("pat@xyz.com")).toBe(
      "{from:pat@xyz.com to:pat@xyz.com cc:pat@xyz.com bcc:pat@xyz.com}",
    );
  });

  it("adds date bounds when given", () => {
    expect(
      buildContactEmailQuery("pat@xyz.com", { after: "2024/01/01", before: "1700000000" }),
    ).toBe(
      "{from:pat@xyz.com to:pat@xyz.com cc:pat@xyz.com bcc:pat@xyz.com} after:2024/01/01 before:1700000000",
    );
  });
});

describe("input checks", () => {
  it("accepts ordinary addresses and refuses anything that could carry search operators", () => {
    expect(isSafeSearchAddress("pat.o'neil+quotes@sub.xyz.com")).toBe(true);
    expect(isSafeSearchAddress("x}{from:boss@co.com@evil.com")).toBe(false);
    expect(isSafeSearchAddress("a@b.com OR in:anywhere")).toBe(false);
    expect(isSafeSearchAddress("no-at-sign")).toBe(false);
  });

  it("accepts dates as YYYY/MM/DD or epoch seconds only", () => {
    expect(isValidDateBound("2024/01/31")).toBe(true);
    expect(isValidDateBound("1700000000")).toBe(true);
    expect(isValidDateBound("yesterday")).toBe(false);
    expect(isValidDateBound("2024-01-31")).toBe(false);
  });

  it("clamps the limit to 1..500 and defaults to 50", () => {
    expect(clampLimit(null)).toBe(50);
    expect(clampLimit("abc")).toBe(50);
    expect(clampLimit("0")).toBe(50);
    expect(clampLimit("20")).toBe(20);
    expect(clampLimit("9999")).toBe(500);
  });
});

describe("mergeMailboxMessages", () => {
  it("collapses the same email held by two mailboxes into one entry with both copies", () => {
    const merged = mergeMailboxMessages([
      { mailbox: "am1@co.com", messages: [message({ id: "g-am1" })] },
      { mailbox: "am2@co.com", messages: [message({ id: "g-am2" })] },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].copies).toEqual([
      { mailbox: "am1@co.com", id: "g-am1", threadId: "t1" },
      { mailbox: "am2@co.com", id: "g-am2", threadId: "t1" },
    ]);
  });

  it("calls it sent when any copy is in Sent, otherwise received", () => {
    const merged = mergeMailboxMessages([
      { mailbox: "am1@co.com", messages: [message({ labelIds: ["SENT"] })] },
      { mailbox: "am2@co.com", messages: [message({ labelIds: ["INBOX"] })] },
    ]);
    expect(merged[0].direction).toBe("sent");

    const received = mergeMailboxMessages([
      { mailbox: "am1@co.com", messages: [message({ labelIds: ["INBOX"] })] },
    ]);
    expect(received[0].direction).toBe("received");
  });

  it("keeps messages without a Message-ID apart instead of merging them", () => {
    const merged = mergeMailboxMessages([
      { mailbox: "am1@co.com", messages: [message({ id: "a", messageId: null })] },
      { mailbox: "am2@co.com", messages: [message({ id: "b", messageId: null })] },
    ]);

    expect(merged).toHaveLength(2);
  });

  it("orders newest first", () => {
    const merged = mergeMailboxMessages([
      {
        mailbox: "am1@co.com",
        messages: [
          message({ id: "old", messageId: "<old@x>", internalDate: 1000 }),
          message({ id: "new", messageId: "<new@x>", internalDate: 9000 }),
        ],
      },
    ]);

    expect(merged.map((m) => m.id)).toEqual(["new", "old"]);
  });
});

describe("pullContactEmails", () => {
  beforeEach(() => {
    getDelegatedAccessToken
      .mockReset()
      .mockImplementation(async ({ subject }) => `token-${subject}`);
    listMessageIds.mockReset();
    getMessageSummary.mockReset();
  });

  it("searches every mailbox as that mailbox, fetching only the ids the search found", async () => {
    listMessageIds.mockImplementation(async (token: string) =>
      token === "token-am1@co.com"
        ? { ids: ["a", "b"], hasMore: false }
        : { ids: ["c"], hasMore: false },
    );
    getMessageSummary.mockImplementation(async (_token: string, id: string) =>
      message({ id, messageId: `<${id}@x>`, internalDate: id === "c" ? 3000 : 1000 }),
    );

    const out = await pullContactEmails({
      address: "pat@xyz.com",
      mailboxes: ["am1@co.com", "am2@co.com"],
      limit: 50,
    });

    expect(getDelegatedAccessToken).toHaveBeenCalledWith({
      subject: "am1@co.com",
      scopes: ["readonly-scope"],
    });
    expect(listMessageIds).toHaveBeenCalledWith(
      "token-am1@co.com",
      "{from:pat@xyz.com to:pat@xyz.com cc:pat@xyz.com bcc:pat@xyz.com}",
      50,
    );
    expect(getMessageSummary).toHaveBeenCalledTimes(3);
    expect(out.messages.map((m) => m.id)).toEqual(["c", "a", "b"]);
    expect(out.mailboxes.map((m) => [m.mailbox, m.fetched])).toEqual([
      ["am1@co.com", 2],
      ["am2@co.com", 1],
    ]);
  });

  it("reports a mailbox that fails and still returns the others", async () => {
    getDelegatedAccessToken.mockImplementation(async ({ subject }) => {
      if (subject === "gone@co.com") throw new Error("unauthorized_client");
      return `token-${subject}`;
    });
    listMessageIds.mockResolvedValue({ ids: ["a"], hasMore: false });
    getMessageSummary.mockResolvedValue(message({ id: "a" }));

    const out = await pullContactEmails({
      address: "pat@xyz.com",
      mailboxes: ["gone@co.com", "am1@co.com"],
      limit: 50,
    });

    expect(out.mailboxes[0]).toMatchObject({
      mailbox: "gone@co.com",
      fetched: 0,
      error: "unauthorized_client",
    });
    expect(out.mailboxes[1].fetched).toBe(1);
    expect(out.messages).toHaveLength(1);
  });

  it("gives a cursor for the next, older page when there are more matches", async () => {
    listMessageIds.mockResolvedValue({ ids: ["a", "b"], hasMore: true });
    getMessageSummary.mockImplementation(async (_t: string, id: string) =>
      message({ id, messageId: `<${id}@x>`, internalDate: id === "a" ? 5_000_000 : 2_000_000 }),
    );

    const out = await pullContactEmails({
      address: "pat@xyz.com",
      mailboxes: ["am1@co.com"],
      limit: 2,
    });

    // oldest fetched is 2,000,000 ms = 2000 s; +1 so the same second is not skipped
    expect(out.mailboxes[0]).toMatchObject({ hasMore: true, nextBefore: 2001 });
  });

  it("gives no cursor when everything was fetched", async () => {
    listMessageIds.mockResolvedValue({ ids: ["a"], hasMore: false });
    getMessageSummary.mockResolvedValue(message({ id: "a" }));

    const out = await pullContactEmails({
      address: "pat@xyz.com",
      mailboxes: ["am1@co.com"],
      limit: 50,
    });

    expect(out.mailboxes[0]).toMatchObject({ hasMore: false, nextBefore: null });
  });
});
