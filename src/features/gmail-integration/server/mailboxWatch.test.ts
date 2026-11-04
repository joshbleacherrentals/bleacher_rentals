import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { refreshMailboxes, type RefreshDeps } from "./mailboxWatch";
import type { SyncOutcome } from "./mailboxSync";

const TOPIC = "projects/bleacher-rentals/topics/gmail-mailbox-changes";
const EXPIRES = new Date("2026-11-05T12:00:00.000Z");

const outcome = (mailbox: string): SyncOutcome => ({
  mailbox,
  status: "synced",
  fetched: 0,
  matched: 0,
  emailsAdded: 0,
  linksAdded: 0,
});

function setup(rows: Record<string, { history_id: string | null } | null>) {
  const updates: { mailbox: string; fields: Record<string, unknown> }[] = [];
  const ensured: string[] = [];
  const deps = {
    state: {
      get: vi.fn(async (mailbox: string) => rows[mailbox] ?? null),
      ensure: vi.fn(async (mailbox: string) => {
        ensured.push(mailbox);
        rows[mailbox] ??= { history_id: null };
      }),
      list: vi.fn(async () => Object.keys(rows)),
      update: vi.fn(async (mailbox: string, fields: Record<string, unknown>) => {
        updates.push({ mailbox, fields });
      }),
    },
    getToken: vi.fn(async (mailbox: string) => `token-for-${mailbox}`),
    watch: vi.fn(async () => ({ historyId: "900", expiresAt: EXPIRES })),
    sync: vi.fn(async (mailbox: string) => outcome(mailbox)),
  } satisfies RefreshDeps;
  return { deps, updates, ensured };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshMailboxes", () => {
  it("gives a new mailbox a row, watches it, and starts it from the watch's own place without syncing", async () => {
    const { deps, updates, ensured } = setup({});

    const [result] = await refreshMailboxes({
      mailboxes: ["new@bleacherrentals.com"],
      topic: TOPIC,
      deps,
    });

    expect(ensured).toEqual(["new@bleacherrentals.com"]);
    expect(deps.watch).toHaveBeenCalledWith("token-for-new@bleacherrentals.com", TOPIC);
    expect(updates).toEqual([
      {
        mailbox: "new@bleacherrentals.com",
        fields: { watch_expires_at: EXPIRES.toISOString(), history_id: "900" },
      },
    ]);
    expect(deps.sync).not.toHaveBeenCalled();
    expect(result).toEqual({ mailbox: "new@bleacherrentals.com", watched: true, sync: null });
  });

  it("renews a known mailbox's watch without touching its place, then syncs it with the same token", async () => {
    const { deps, updates } = setup({ "paul@bleacherrentals.com": { history_id: "100" } });

    const [result] = await refreshMailboxes({
      mailboxes: ["paul@bleacherrentals.com"],
      topic: TOPIC,
      deps,
    });

    expect(updates).toEqual([
      {
        mailbox: "paul@bleacherrentals.com",
        fields: { watch_expires_at: EXPIRES.toISOString() },
      },
    ]);
    expect(deps.sync).toHaveBeenCalledWith(
      "paul@bleacherrentals.com",
      "token-for-paul@bleacherrentals.com",
    );
    expect(deps.getToken).toHaveBeenCalledTimes(1);
    expect(result.watched).toBe(true);
    expect(result.sync).toMatchObject({ status: "synced" });
  });

  it("only syncs, and watches nothing, when there is no topic", async () => {
    const { deps } = setup({ "paul@bleacherrentals.com": { history_id: "100" } });

    const [result] = await refreshMailboxes({
      mailboxes: ["paul@bleacherrentals.com"],
      topic: null,
      deps,
    });

    expect(deps.watch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ watched: false });
    expect(deps.sync).toHaveBeenCalledTimes(1);
  });

  it("starts a mailbox with no place through the sync when there is no topic to watch", async () => {
    const { deps } = setup({});

    await refreshMailboxes({ mailboxes: ["new@bleacherrentals.com"], topic: null, deps });

    expect(deps.sync).toHaveBeenCalledTimes(1);
  });

  it("notes a mailbox's failure on its row and carries on with the others", async () => {
    const { deps, updates } = setup({
      "ok@bleacherrentals.com": { history_id: "1" },
      "gone@bleacherrentals.com": { history_id: "1" },
    });
    deps.getToken.mockImplementation(async (mailbox: string) => {
      if (mailbox.startsWith("gone")) throw new Error("Google refused the delegated token request");
      return "token";
    });

    const results = await refreshMailboxes({
      mailboxes: ["gone@bleacherrentals.com", "ok@bleacherrentals.com"],
      topic: TOPIC,
      deps,
    });

    expect(results[0]).toMatchObject({
      mailbox: "gone@bleacherrentals.com",
      watched: false,
      sync: null,
      error: "Google refused the delegated token request",
    });
    expect(results[1]).toMatchObject({ mailbox: "ok@bleacherrentals.com", watched: true });
    expect(updates).toContainEqual({
      mailbox: "gone@bleacherrentals.com",
      fields: { last_error: "Google refused the delegated token request" },
    });
  });

  it("reports a failure to sync as the mailbox's error, keeping that its watch was set", async () => {
    const { deps } = setup({ "paul@bleacherrentals.com": { history_id: "100" } });
    deps.sync.mockRejectedValue(new Error("Gmail API 403: Delegation denied"));

    const [result] = await refreshMailboxes({
      mailboxes: ["paul@bleacherrentals.com"],
      topic: TOPIC,
      deps,
    });

    expect(result).toMatchObject({
      watched: true,
      sync: null,
      error: "Gmail API 403: Delegation denied",
    });
  });

  it("does nothing for no mailboxes", async () => {
    const { deps } = setup({});

    expect(await refreshMailboxes({ mailboxes: [], topic: TOPIC, deps })).toEqual([]);
  });
});
