import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const admin = { fake: "admin" };
vi.mock("@/utils/supabase/server", () => ({ createServiceRoleClient: async () => admin }));

const resolveDomainMailboxes = vi.fn();
vi.mock("@/features/gmail-integration/server/domainMailboxes", () => ({
  resolveDomainMailboxes: (...args: unknown[]) => resolveDomainMailboxes(...args),
}));

vi.mock("@/features/gmail-integration/server/mailboxSync", () => ({
  supabaseSyncState: () => ({ fake: "state" }),
}));

const refreshMailboxes = vi.fn();
vi.mock("@/features/gmail-integration/server/mailboxWatch", () => ({
  refreshMailboxes: (...args: unknown[]) => refreshMailboxes(...args),
}));

vi.mock("@/features/gmail-integration/server/syncRunner", () => ({
  getMailboxToken: async () => "token",
  syncMailboxFromGmail: async () => ({}),
}));

vi.mock("@/features/gmail-integration/server/gmailMessages", () => ({
  watchMailbox: async () => ({}),
}));

import { GET } from "./route";

const get = (authorization?: string) =>
  GET(
    new NextRequest("http://localhost:3000/api/cron/gmail-watch", {
      headers: authorization ? { authorization } : {},
    }),
  );

const OLD_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  delete process.env.GMAIL_PUSH_TOPIC;
  resolveDomainMailboxes.mockResolvedValue({ mailboxes: ["a@bleacherrentals.com"] });
  refreshMailboxes.mockResolvedValue([
    { mailbox: "a@bleacherrentals.com", watched: true, sync: null },
    { mailbox: "b@bleacherrentals.com", watched: false, sync: null, error: "suspended" },
  ]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe("GET /api/cron/gmail-watch", () => {
  it("answers only the cron's secret", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    expect(resolveDomainMailboxes).not.toHaveBeenCalled();
  });

  it("answers nobody when no secret is set, not even 'Bearer undefined'", async () => {
    delete process.env.CRON_SECRET;

    expect((await get("Bearer undefined")).status).toBe(401);
    expect(resolveDomainMailboxes).not.toHaveBeenCalled();
  });

  it("refreshes every mailbox Google's directory lists, watching them when a topic is set", async () => {
    process.env.GMAIL_PUSH_TOPIC = " projects/p/topics/gmail-mailbox-changes ";

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(200);
    expect(resolveDomainMailboxes).toHaveBeenCalledWith({ source: "directory" });
    expect(refreshMailboxes).toHaveBeenCalledWith(
      expect.objectContaining({
        mailboxes: ["a@bleacherrentals.com"],
        topic: "projects/p/topics/gmail-mailbox-changes",
      }),
    );
    expect(await res.json()).toMatchObject({ watching: true, mailboxes: 2, failed: 1 });
  });

  it("only syncs, and watches nothing, when no topic is set", async () => {
    const res = await get("Bearer s3cret");

    expect(refreshMailboxes).toHaveBeenCalledWith(expect.objectContaining({ topic: null }));
    expect(await res.json()).toMatchObject({ watching: false });
  });

  it("reports a failure to list the mailboxes", async () => {
    resolveDomainMailboxes.mockRejectedValue(new Error("GMAIL_DIRECTORY_ADMINS has no admin"));

    const res = await get("Bearer s3cret");

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/GMAIL_DIRECTORY_ADMINS/);
  });
});
