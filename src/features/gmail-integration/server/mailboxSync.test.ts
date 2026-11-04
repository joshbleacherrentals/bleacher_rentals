import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ContactEmail } from "./contactEmails";
import { GmailApiError, type GmailMessageSummary } from "./gmailMessages";
import {
  CATCH_UP_COUNT,
  isPermanentGmailFailure,
  keepAddedMessage,
  syncMailbox,
  type SyncGmail,
  type SyncState,
} from "./mailboxSync";

const MAILBOX = "paul@bleacherrentals.com";
const NOW = new Date("2026-10-29T12:00:00.000Z");

const summary = (id: string, labelIds: string[] = ["INBOX"]): GmailMessageSummary => ({
  id,
  threadId: `t-${id}`,
  messageId: `<${id}@x>`,
  inReplyTo: null,
  references: null,
  from: "Pat <pat@xyz.com>",
  to: MAILBOX,
  cc: null,
  subject: "Quote",
  date: null,
  snippet: "",
  internalDate: 1,
  labelIds,
});

/** A state with the mailbox's row as given (null: no row), recording every update. */
function fakeState(row: { history_id: string | null } | null) {
  const updates: Record<string, unknown>[] = [];
  const state: SyncState = {
    get: async () => row,
    ensure: async () => {},
    list: async () => [MAILBOX],
    update: async (_mailbox, fields) => {
      updates.push(fields);
    },
  };
  return { state, updates };
}

function fakeGmail(over: Partial<SyncGmail> = {}) {
  const gmail: SyncGmail = {
    listHistory: vi.fn(async () => ({
      added: [],
      lastRecordId: null,
      historyId: "200",
      nextPageToken: null,
    })),
    getProfileHistoryId: vi.fn(async () => "500"),
    getMessageSummary: vi.fn(async (_token: string, id: string) => summary(id)),
    listLatestMessages: vi.fn(async () => []),
    ...over,
  };
  return gmail;
}

const save = vi.fn(async (emails: ContactEmail[]) => ({
  matched: emails.length,
  emailsAdded: emails.length,
  linksAdded: emails.length,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const run = (
  state: SyncState,
  gmail: SyncGmail,
  over: Partial<Parameters<typeof syncMailbox>[0]> = {},
) =>
  syncMailbox({
    mailbox: MAILBOX,
    accessToken: "ya29.token",
    state,
    save,
    gmail,
    now: () => NOW,
    ...over,
  });

describe("keepAddedMessage", () => {
  it("keeps mail that was received or sent, and drops drafts, spam and trash", () => {
    expect(keepAddedMessage(["INBOX", "UNREAD"])).toBe(true);
    expect(keepAddedMessage(["SENT"])).toBe(true);
    expect(keepAddedMessage([])).toBe(true);
    expect(keepAddedMessage(["DRAFT"])).toBe(false);
    expect(keepAddedMessage(["INBOX", "SPAM"])).toBe(false);
    expect(keepAddedMessage(["TRASH"])).toBe(false);
  });
});

describe("isPermanentGmailFailure", () => {
  it("is true when Gmail refuses the request itself, which sending it again would not change", () => {
    for (const status of [400, 401, 403, 404]) {
      expect(isPermanentGmailFailure(new GmailApiError(status, "no")), String(status)).toBe(true);
    }
  });

  it("is false for a busy or failing Gmail, and for anything that is not a Gmail refusal", () => {
    for (const status of [408, 429, 500, 503]) {
      expect(isPermanentGmailFailure(new GmailApiError(status, "later")), String(status)).toBe(
        false,
      );
    }
    expect(isPermanentGmailFailure(new Error("Google refused the delegated token request"))).toBe(
      false,
    );
    expect(isPermanentGmailFailure(undefined)).toBe(false);
  });
});

describe("syncMailbox", () => {
  it("refuses a mailbox that has no row", async () => {
    const { state } = fakeState(null);

    await expect(run(state, fakeGmail())).rejects.toThrow(/not a mailbox that is kept up to date/);
  });

  it("starts a mailbox with no place from now, fetching nothing", async () => {
    const { state, updates } = fakeState({ history_id: null });
    const gmail = fakeGmail();

    const outcome = await run(state, gmail);

    expect(outcome).toMatchObject({ status: "baselined", fetched: 0, emailsAdded: 0 });
    expect(gmail.listHistory).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(updates).toEqual([
      { history_id: "500", last_synced_at: NOW.toISOString(), last_error: null },
    ]);
  });

  it("fetches what was added since the mailbox's place, saves it, and moves the place forward", async () => {
    const { state, updates } = fakeState({ history_id: "100" });
    const gmail = fakeGmail({
      listHistory: vi.fn(async () => ({
        added: [
          { id: "a1", labelIds: ["INBOX"] },
          { id: "b2", labelIds: ["SENT"] },
        ],
        lastRecordId: "150",
        historyId: "160",
        nextPageToken: null,
      })),
      // Gmail's own labels on the fetched email are what say it was sent.
      getMessageSummary: vi.fn(async (_token: string, id: string) =>
        summary(id, id === "b2" ? ["SENT"] : ["INBOX"]),
      ),
    });

    const outcome = await run(state, gmail);

    expect(gmail.listHistory).toHaveBeenCalledWith("ya29.token", "100", undefined);
    expect(gmail.getMessageSummary).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][0];
    expect(saved.map((e) => e.copies[0].id).sort()).toEqual(["a1", "b2"]);
    expect(saved.find((e) => e.copies[0].id === "b2")?.direction).toBe("sent");
    expect(outcome).toMatchObject({ status: "synced", fetched: 2, emailsAdded: 2, linksAdded: 2 });
    expect(updates).toEqual([
      { history_id: "160", last_synced_at: NOW.toISOString(), last_error: null },
    ]);
  });

  it("only moves the place when nothing was added, and saves nothing", async () => {
    const { state, updates } = fakeState({ history_id: "100" });

    const outcome = await run(state, fakeGmail());

    expect(outcome).toMatchObject({ status: "synced", fetched: 0, emailsAdded: 0 });
    expect(save).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ history_id: "200" });
  });

  it("skips drafts, spam and trash without fetching them", async () => {
    const { state } = fakeState({ history_id: "100" });
    const gmail = fakeGmail({
      listHistory: vi.fn(async () => ({
        added: [
          { id: "ok", labelIds: ["INBOX"] },
          { id: "draft", labelIds: ["DRAFT"] },
          { id: "spam", labelIds: ["SPAM", "UNREAD"] },
          { id: "bin", labelIds: ["TRASH"] },
        ],
        lastRecordId: "1",
        historyId: "2",
        nextPageToken: null,
      })),
    });

    await run(state, gmail);

    expect(gmail.getMessageSummary).toHaveBeenCalledTimes(1);
    expect(gmail.getMessageSummary).toHaveBeenCalledWith("ya29.token", "ok");
  });

  it("looks at an email once when it was added twice, using its latest labels", async () => {
    const { state } = fakeState({ history_id: "100" });
    const gmail = fakeGmail({
      listHistory: vi.fn(async () => ({
        added: [
          { id: "a1", labelIds: ["INBOX"] },
          { id: "a1", labelIds: ["INBOX", "TRASH"] },
        ],
        lastRecordId: "1",
        historyId: "2",
        nextPageToken: null,
      })),
    });

    await run(state, gmail);

    expect(gmail.getMessageSummary).not.toHaveBeenCalled();
  });

  it("reads every page of history and then goes on from Gmail's current id", async () => {
    const { state, updates } = fakeState({ history_id: "100" });
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce({
        added: [{ id: "a1", labelIds: [] }],
        lastRecordId: "120",
        historyId: "300",
        nextPageToken: "p2",
      })
      .mockResolvedValueOnce({
        added: [{ id: "b2", labelIds: [] }],
        lastRecordId: "180",
        historyId: "300",
        nextPageToken: null,
      });

    await run(state, fakeGmail({ listHistory }));

    expect(listHistory).toHaveBeenCalledTimes(2);
    expect(listHistory.mock.calls[1]).toEqual(["ya29.token", "100", "p2"]);
    expect(save.mock.calls[0][0]).toHaveLength(2);
    expect(updates[0]).toMatchObject({ history_id: "300" });
  });

  it("goes on from the last change it handled when the pages never end, so the rest comes next time", async () => {
    const { state, updates } = fakeState({ history_id: "100" });
    const listHistory = vi.fn(async () => ({
      added: [],
      lastRecordId: "777",
      historyId: "9999",
      nextPageToken: "more",
    }));

    await run(state, fakeGmail({ listHistory }));

    expect(listHistory.mock.calls.length).toBeGreaterThan(1);
    expect(updates[0]).toMatchObject({ history_id: "777" });
  });

  it("skips an email that is gone by the time it is fetched, and still saves the rest", async () => {
    const { state } = fakeState({ history_id: "100" });
    const gmail = fakeGmail({
      listHistory: vi.fn(async () => ({
        added: [
          { id: "gone", labelIds: [] },
          { id: "here", labelIds: [] },
        ],
        lastRecordId: "1",
        historyId: "2",
        nextPageToken: null,
      })),
      getMessageSummary: vi.fn(async (_token: string, id: string) => {
        if (id === "gone") throw new GmailApiError(404, "Requested entity was not found.");
        return summary(id);
      }),
    });

    const outcome = await run(state, gmail);

    expect(outcome.fetched).toBe(1);
    expect(save.mock.calls[0][0].map((e) => e.copies[0].id)).toEqual(["here"]);
  });

  it("looks at the latest emails instead when Gmail no longer keeps the history", async () => {
    const { state, updates } = fakeState({ history_id: "1" });
    const gmail = fakeGmail({
      listHistory: vi.fn(async () => {
        throw new GmailApiError(404, "Requested entity was not found.");
      }),
      listLatestMessages: vi.fn(async () => [
        summary("n1"),
        summary("n2", ["SPAM"]),
        summary("n3", ["SENT"]),
      ]),
    });

    const outcome = await run(state, gmail);

    expect(gmail.listLatestMessages).toHaveBeenCalledWith("ya29.token", CATCH_UP_COUNT);
    expect(outcome).toMatchObject({ status: "caught-up", fetched: 2 });
    expect(save.mock.calls[0][0].map((e) => e.copies[0].id).sort()).toEqual(["n1", "n3"]);
    // The place is Gmail's current one, taken before the list so nothing in between is lost.
    expect(updates[0]).toMatchObject({ history_id: "500" });
    const profileCall = (gmail.getProfileHistoryId as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const listCall = (gmail.listLatestMessages as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(profileCall).toBeLessThan(listCall);
  });

  it("keeps the place, notes the reason, and throws when saving fails", async () => {
    const { state, updates } = fakeState({ history_id: "100" });
    const gmail = fakeGmail({
      listHistory: vi.fn(async () => ({
        added: [{ id: "a1", labelIds: [] }],
        lastRecordId: "1",
        historyId: "2",
        nextPageToken: null,
      })),
    });
    const failing = vi.fn(async () => {
      throw new Error("Could not check the Blocked Emails list: connection lost");
    });

    await expect(run(state, gmail, { save: failing })).rejects.toThrow(/Blocked Emails list/);

    // No update moved the place; the only one is the reason.
    expect(updates).toEqual([
      { last_error: "Could not check the Blocked Emails list: connection lost" },
    ]);
  });

  it("throws any other Gmail failure, without moving the place", async () => {
    const { state, updates } = fakeState({ history_id: "100" });
    const gmail = fakeGmail({
      listHistory: vi.fn(async () => {
        throw new GmailApiError(403, "Delegation denied");
      }),
    });

    await expect(run(state, gmail)).rejects.toMatchObject({ status: 403 });
    expect(updates).toEqual([{ last_error: "Gmail API 403: Delegation denied" }]);
    expect(save).not.toHaveBeenCalled();
  });
});
