import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const admin = { fake: "admin" };
vi.mock("@/utils/supabase/server", () => ({ createServiceRoleClient: async () => admin }));

const requireAdmin = vi.fn();
vi.mock("@/features/userAccess/logic/requireAdmin", () => ({
  requireAdmin: () => requireAdmin(),
}));

vi.mock("@/features/gmail-integration/server/mailboxes", () => ({
  getMailboxDomain: () => "bleacherrentals.com",
}));

const list = vi.fn();
vi.mock("@/features/gmail-integration/server/mailboxSync", () => ({
  supabaseSyncState: () => ({ list: () => list() }),
}));

const syncMailboxFromGmail = vi.fn();
vi.mock("@/features/gmail-integration/server/syncRunner", () => ({
  syncMailboxFromGmail: (...args: unknown[]) => syncMailboxFromGmail(...args),
}));

import { POST } from "./route";

const post = (body?: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/gmail/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("user_admin");
  list.mockResolvedValue(["a@bleacherrentals.com", "b@bleacherrentals.com"]);
  syncMailboxFromGmail.mockImplementation(async (_admin: unknown, mailbox: string) => ({
    mailbox,
    status: "synced",
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/gmail/sync", () => {
  it("is for admins only", async () => {
    requireAdmin.mockRejectedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );

    const res = await post({ mailbox: "a@bleacherrentals.com" });

    expect(res.status).toBe(403);
    expect(syncMailboxFromGmail).not.toHaveBeenCalled();
  });

  it("syncs one mailbox, giving it a row if it has none", async () => {
    const res = await post({ mailbox: " Paul@BleacherRentals.com " });

    expect(res.status).toBe(200);
    expect(syncMailboxFromGmail).toHaveBeenCalledWith(admin, "paul@bleacherrentals.com", {
      createRow: true,
    });
    expect((await res.json()).results).toEqual([
      { mailbox: "paul@bleacherrentals.com", status: "synced" },
    ]);
  });

  it("accepts only an address at the configured domain", async () => {
    for (const mailbox of ["someone@gmail.com", "not-an-address", "x@evil-bleacherrentals.com"]) {
      const res = await post({ mailbox });
      expect(res.status, mailbox).toBe(400);
    }
    expect(syncMailboxFromGmail).not.toHaveBeenCalled();
  });

  it("syncs every mailbox with a row when none is named, and one failing does not stop the rest", async () => {
    syncMailboxFromGmail.mockImplementation(async (_admin: unknown, mailbox: string) => {
      if (mailbox.startsWith("a@")) throw new Error("Gmail API 403: Delegation denied");
      return { mailbox, status: "synced" };
    });

    const res = await post();

    expect(res.status).toBe(200);
    expect((await res.json()).results).toEqual([
      { mailbox: "a@bleacherrentals.com", error: "Gmail API 403: Delegation denied" },
      { mailbox: "b@bleacherrentals.com", status: "synced" },
    ]);
  });

  it("reports a sync of a single mailbox that fails", async () => {
    syncMailboxFromGmail.mockRejectedValue(new Error("boom"));

    const res = await post({ mailbox: "a@bleacherrentals.com" });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
