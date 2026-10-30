import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const admin = { fake: "admin" };
vi.mock("@/utils/supabase/server", () => ({ createServiceRoleClient: async () => admin }));

const verifyPubSubPush = vi.fn();
vi.mock("@/features/gmail-integration/server/pubsubAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gmail-integration/server/pubsubAuth")>()),
  verifyPubSubPush: (...args: unknown[]) => verifyPubSubPush(...args),
}));

const getRow = vi.fn();
vi.mock("@/features/gmail-integration/server/mailboxSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gmail-integration/server/mailboxSync")>()),
  supabaseSyncState: () => ({ get: (...args: unknown[]) => getRow(...args) }),
}));

const syncMailboxFromGmail = vi.fn();
vi.mock("@/features/gmail-integration/server/syncRunner", () => ({
  syncMailboxFromGmail: (...args: unknown[]) => syncMailboxFromGmail(...args),
}));

import { GmailApiError } from "@/features/gmail-integration/server/gmailMessages";
import { POST } from "./route";

const envelope = (note: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(note)).toString("base64"), messageId: "1" },
  subscription: "projects/p/subscriptions/s",
});

const push = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/gmail/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer signed" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const note = envelope({ emailAddress: "Paul@BleacherRentals.com", historyId: 1234 });

beforeEach(() => {
  vi.clearAllMocks();
  verifyPubSubPush.mockResolvedValue({ ok: true });
  getRow.mockResolvedValue({ history_id: "100" });
  syncMailboxFromGmail.mockResolvedValue({ status: "synced" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/gmail/push", () => {
  it("syncs the mailbox the notification names, and says it is handled", async () => {
    const res = await push(note);

    expect(res.status).toBe(204);
    expect(getRow).toHaveBeenCalledWith("paul@bleacherrentals.com");
    expect(syncMailboxFromGmail).toHaveBeenCalledWith(admin, "paul@bleacherrentals.com");
  });

  it("refuses a request that is not from our subscription, before reading it", async () => {
    verifyPubSubPush.mockResolvedValue({ ok: false, status: 401, reason: "Invalid token." });

    const res = await push(note);

    expect(res.status).toBe(401);
    expect(getRow).not.toHaveBeenCalled();
    expect(syncMailboxFromGmail).not.toHaveBeenCalled();
  });

  it("says so, loudly, when the route is not configured", async () => {
    verifyPubSubPush.mockResolvedValue({
      ok: false,
      status: 500,
      reason: "GMAIL_PUSH_AUDIENCE is not set",
    });

    const res = await push(note);

    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
    expect(syncMailboxFromGmail).not.toHaveBeenCalled();
  });

  it("marks a body that is not a Gmail notification as handled, so Pub/Sub does not keep sending it", async () => {
    for (const body of ["not json", { message: {} }, envelope({ hello: "world" })]) {
      const res = await push(body);
      expect(res.status).toBe(204);
    }
    expect(syncMailboxFromGmail).not.toHaveBeenCalled();
  });

  it("ignores a mailbox we do not follow, so a notification cannot make us read another one", async () => {
    getRow.mockResolvedValue(null);

    const res = await push(note);

    expect(res.status).toBe(204);
    expect(syncMailboxFromGmail).not.toHaveBeenCalled();
  });

  it("asks Pub/Sub to send it again when the sync fails in a way that may pass", async () => {
    syncMailboxFromGmail.mockRejectedValue(new Error("Google refused the delegated token request"));

    expect((await push(note)).status).toBe(500);

    syncMailboxFromGmail.mockRejectedValue(new GmailApiError(503, "Backend Error"));
    expect((await push(note)).status).toBe(500);

    syncMailboxFromGmail.mockRejectedValue(new GmailApiError(429, "Rate Limit Exceeded"));
    expect((await push(note)).status).toBe(500);
  });

  it("calls it handled when Gmail refuses the mailbox for good, since sending it again would not help", async () => {
    syncMailboxFromGmail.mockRejectedValue(new GmailApiError(403, "Delegation denied"));

    const res = await push(note);

    expect(res.status).toBe(204);
    expect(console.error).toHaveBeenCalled();
  });
});
